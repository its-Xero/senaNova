"""
Authentication Router
- Signup, Login, Forgot Password, Reset Password, Me endpoint
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import User, Profile, PasswordResetToken, EmailConfirmationToken, PendingSignup
from app.security import hash_password, verify_password, generate_reset_token, hash_reset_token, create_access_token, create_refresh_token
from app.services.email_service import send_password_reset_email, send_confirmation_email
import httpx
from fastapi import Response
from app.config import get_settings

settings = get_settings()

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotRequest(BaseModel):
    email: EmailStr


class ResetRequest(BaseModel):
    token: str
    new_password: str


class TokenResponse(BaseModel):
    access_token: str
    expires_in: int
    refresh_token: str


@router.post("/signup")
async def signup(data: SignupRequest):
    async with AsyncSessionLocal() as db:
        q = await db.execute(select(User).where(User.email == data.email))
        existing = q.scalars().first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")

        # create a pending signup (do not create User until email confirmed)
        hashed_pw = hash_password(data.password)
        expires_at = datetime.utcnow() + timedelta(minutes=settings.email_confirmation_expire_minutes)
        pending = PendingSignup(email=data.email, hashed_password=hashed_pw, display_name=(data.display_name or data.email.split("@")[0]), expires_at=expires_at)
        db.add(pending)
        await db.commit()
        await db.refresh(pending)

        token = generate_reset_token()
        hashed = hash_reset_token(token)
        ect = EmailConfirmationToken(pending_signup_id=pending.id, token_hash=hashed, expires_at=expires_at)
        db.add(ect)
        await db.commit()

        await send_confirmation_email(data.email, token)
        return {"ok": True, "message": "Confirmation email sent"}


@router.post("/login")
async def login(data: LoginRequest):
    async with AsyncSessionLocal() as db:
        q = await db.execute(select(User).where(User.email == data.email))
        user = q.scalars().first()
        if not user or not user.hashed_password or not verify_password(data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account not confirmed")

        access, expires = create_access_token(user.id)
        refresh = create_refresh_token(user.id)
        return TokenResponse(access_token=access, expires_in=expires, refresh_token=refresh)


@router.post("/forgot")
async def forgot_password(data: ForgotRequest):
    async with AsyncSessionLocal() as db:
        q = await db.execute(select(User).where(User.email == data.email))
        user = q.scalars().first()
        if not user:
            # Do not reveal
            return {"ok": True}

        token = generate_reset_token()
        hashed = hash_reset_token(token)

        expires_at = datetime.utcnow() + timedelta(minutes=settings.password_reset_expire_minutes)
        pr = PasswordResetToken(user_id=user.id, token_hash=hashed, expires_at=expires_at)
        db.add(pr)
        await db.commit()

        await send_password_reset_email(data.email, token)
        return {"ok": True}


@router.post("/reset")
async def reset_password(data: ResetRequest):
    token = data.token
    hashed = hash_reset_token(token)
    async with AsyncSessionLocal() as db:
        q = await db.execute(select(PasswordResetToken).where(PasswordResetToken.token_hash == hashed))
        pr = q.scalars().first()
        if not pr or pr.used:
            raise HTTPException(status_code=400, detail="Invalid token")
        if pr.expires_at < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Token expired")

        # load user
        q2 = await db.execute(select(User).where(User.id == pr.user_id))
        user = q2.scalars().first()
        if not user:
            raise HTTPException(status_code=400, detail="Invalid token")

        user.hashed_password = hash_password(data.new_password)
        pr.used = True
        db.add(user)
        db.add(pr)
        await db.commit()
        return {"ok": True}



class ConfirmRequest(BaseModel):
    token: str


@router.post("/confirm")
async def confirm_email(data: ConfirmRequest):
    token = data.token
    hashed = hash_reset_token(token)
    async with AsyncSessionLocal() as db:
        q = await db.execute(select(EmailConfirmationToken).where(EmailConfirmationToken.token_hash == hashed))
        ect = q.scalars().first()
        if not ect or ect.used:
            raise HTTPException(status_code=400, detail="Invalid token")
        if ect.expires_at < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Token expired")
        # If this token is tied to a pending signup, create the user now
        if ect.pending_signup_id:
            qps = await db.execute(select(PendingSignup).where(PendingSignup.id == ect.pending_signup_id))
            pending = qps.scalars().first()
            if not pending or pending.used or pending.expires_at < datetime.utcnow():
                raise HTTPException(status_code=400, detail="Invalid token")

            # create user
            user = User(email=pending.email, hashed_password=pending.hashed_password, is_active=True)
            db.add(user)
            await db.commit()
            await db.refresh(user)

            profile = Profile(id=user.id, display_name=(pending.display_name or pending.email.split("@")[0]))
            db.add(profile)

            pending.used = True
            ect.used = True
            db.add(pending)
            db.add(ect)
            await db.commit()

            access, expires = create_access_token(user.id)
            refresh = create_refresh_token(user.id)
            return TokenResponse(access_token=access, expires_in=expires, refresh_token=refresh)

        # fallback: token tied to existing user
        q2 = await db.execute(select(User).where(User.id == ect.user_id))
        user = q2.scalars().first()
        if not user:
            raise HTTPException(status_code=400, detail="Invalid token")

        user.is_active = True
        ect.used = True
        db.add(user)
        db.add(ect)
        await db.commit()

        access, expires = create_access_token(user.id)
        refresh = create_refresh_token(user.id)
        return TokenResponse(access_token=access, expires_in=expires, refresh_token=refresh)


@router.get("/google/start")
async def google_start():
    """Redirect user to Google's OAuth consent screen."""
    client_id = settings.google_client_id
    redirect = settings.google_backend_callback
    scope = "openid email profile"
    state = ""  # could include anti-forgery
    url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={client_id}"
        f"&redirect_uri={redirect}&scope={scope}&access_type=offline&prompt=consent&state={state}"
    )
    return Response(status_code=307, headers={"Location": url})


@router.get("/google/callback")
async def google_callback(code: str | None = None, error: str | None = None):
    if error or not code:
        raise HTTPException(status_code=400, detail="OAuth failed")

    token_url = "https://oauth2.googleapis.com/token"
    async with httpx.AsyncClient() as client:
        resp = await client.post(token_url, data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_backend_callback,
            "grant_type": "authorization_code",
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})

        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Token exchange failed")
        token_data = resp.json()
        access_token = token_data.get("access_token")

        userinfo = await client.get("https://www.googleapis.com/oauth2/v3/userinfo", headers={"Authorization": f"Bearer {access_token}"})
        if userinfo.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch userinfo")
        ui = userinfo.json()

    # ui contains email, name, picture
    email = ui.get("email")
    name = ui.get("name") or email.split("@")[0]

    async with AsyncSessionLocal() as db:
        q = await db.execute(select(User).where(User.email == email))
        user = q.scalars().first()
        if not user:
            # create and activate user for OAuth
            user = User(email=email, hashed_password=None, is_active=True)
            db.add(user)
            await db.commit()
            await db.refresh(user)
            profile = Profile(id=user.id, display_name=name)
            db.add(profile)
            await db.commit()

        # ensure active
        user.is_active = True
        db.add(user)
        await db.commit()

        access, expires = create_access_token(user.id)
        refresh = create_refresh_token(user.id)

    # redirect to frontend callback with tokens (short-lived convenience)
    target = f"{settings.frontend_base_url.rstrip('/')}/auth/callback?access_token={access}&refresh_token={refresh}"
    return Response(status_code=307, headers={"Location": target})


@router.get("/me")
async def me(request: Request):
    auth = request.headers.get("authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = auth.split(" ", 1)[1]
    sub = None
    try:
        from app.security import decode_token
        sub = decode_token(token)
    except Exception:
        sub = None
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token")

    async with AsyncSessionLocal() as db:
        q = await db.execute(select(User).where(User.id == sub))
        user = q.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="Not found")
        return {"id": user.id, "email": user.email, "display_name": user.profile.display_name if user.profile else None}

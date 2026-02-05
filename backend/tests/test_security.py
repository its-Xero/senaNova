import pytest
from app.security import hash_password, verify_password


def test_hash_and_verify():
    pw = "supersecret"
    hashed = hash_password(pw)
    assert verify_password(pw, hashed) is True
    assert verify_password("wrong", hashed) is False

"""Initialize the database by creating tables (calls init_db from app.database)."""
import asyncio

from app.database import init_db


def main():
    asyncio.run(init_db())


if __name__ == "__main__":
    main()

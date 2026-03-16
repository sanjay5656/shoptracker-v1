# database.py
# This file handles ONE job: connecting Python to our SQLite database
# Every other file imports from here

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# ─────────────────────────────────────────
# DATABASE URL
# ─────────────────────────────────────────
# This tells SQLAlchemy WHERE the database file is
# sqlite:///  means "use SQLite"
# ./shoptracker.db means "create the file here in backend folder"
# The file gets created automatically when app starts

SQLALCHEMY_DATABASE_URL = "sqlite:///./shoptracker.db"

# ─────────────────────────────────────────
# ENGINE
# ─────────────────────────────────────────
# The engine is the actual CONNECTION to the database
# Like a phone line between Python and SQLite
#
# check_same_thread=False is needed for SQLite only
# Because FastAPI handles multiple requests at same time
# Without this setting, SQLite would throw errors

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)

# ─────────────────────────────────────────
# SESSION
# ─────────────────────────────────────────
# A session is a temporary workspace for one request
# Think of it like a shopping basket:
# → Customer picks items (read/write database)
# → At checkout, everything saves (commit)
# → Basket is emptied (session closed)
#
# autocommit=False → we manually say when to save
# autoflush=False  → we control when data is sent to db

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# ─────────────────────────────────────────
# BASE
# ─────────────────────────────────────────
# Base is a parent class for all our database tables
# When we create Category, Purchase, Sale, Stock tables
# they all inherit from Base
# This lets SQLAlchemy know about all our tables

Base = declarative_base()

# ─────────────────────────────────────────
# GET DATABASE SESSION
# ─────────────────────────────────────────
# This function is used by every API endpoint
# It gives them a database session to work with
# The try/finally makes sure session ALWAYS closes
# even if an error happens
#
# yield = give the session to whoever asked for it
# finally = no matter what happens, always close it

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

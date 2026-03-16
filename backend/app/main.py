# main.py
# This is the ENTRY POINT of the entire application
# When we run: uvicorn app.main:app
# Python comes here first

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Import our database connection and Base
# Base knows about all our tables (Category, Purchase, Sale, Stock)
from app.database import engine, Base

# Import all our routers
# Each router handles one feature's API endpoints
from app.routers import categories, purchases, sales, dashboard

# ─────────────────────────────────────────
# CREATE DATABASE TABLES
# ─────────────────────────────────────────
# This line looks at ALL classes that inherit from Base
# (Category, Purchase, Sale, Stock in models.py)
# And creates their tables in SQLite if they don't exist yet
# Safe to run every time — won't delete existing data
Base.metadata.create_all(bind=engine)

# ─────────────────────────────────────────
# CREATE FASTAPI APP
# ─────────────────────────────────────────
# This is the main application object
# Everything connects to this

app = FastAPI(
    title="ShopTracker API",
    description="Simple shop management for small retail shops in India",
    version="1.0.0"
)

# ─────────────────────────────────────────
# CORS MIDDLEWARE
# ─────────────────────────────────────────
# CORS = Cross Origin Resource Sharing
# Problem: Browser blocks requests from one address to another
# Example: Frontend on port 5500 calling API on port 8000
# Solution: Tell the API to allow requests from anywhere
#
# allow_origins=["*"] means accept requests from ANY address
# This is fine for V1 (own shop only)
# In V2 we will restrict this to specific domains

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# ─────────────────────────────────────────
# REGISTER ROUTERS
# ─────────────────────────────────────────
# Each router is a group of related API endpoints
# Including them here makes them part of the app
#
# categories router → handles /categories/ endpoints
# purchases router  → handles /purchases/ endpoints
# sales router      → handles /sales/ endpoints
# dashboard router  → handles /dashboard/ endpoints

app.include_router(categories.router)
app.include_router(purchases.router)
app.include_router(sales.router)
app.include_router(dashboard.router)

# ─────────────────────────────────────────
# STATUS ENDPOINT
# ─────────────────────────────────────────
# Simple endpoint to check if API is running
# Visit http://localhost:8000/api/status in browser
# Should return: {"status": "online"}

@app.get("/api/status")
def get_status():
    return {
        "message": "ShopTracker API is running!",
        "version": "1.0.0",
        "status": "online"
    }

# ─────────────────────────────────────────
# SERVE FRONTEND
# ─────────────────────────────────────────
# This makes FastAPI serve our HTML/CSS/JS files
# So we only need ONE server for everything
#
# FRONTEND_DIR = the path to our frontend folder
# We go up two levels from app/ to reach the project root
# Then into frontend/

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
FRONTEND_DIR = os.path.abspath(FRONTEND_DIR)

if os.path.exists(FRONTEND_DIR):
    # Serve index.html when someone visits /
    @app.get("/")
    def serve_frontend():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    # Serve all other frontend files (style.css, app.js)
    # This MUST come after all API routes
    # Otherwise it would intercept API calls
    app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="static")

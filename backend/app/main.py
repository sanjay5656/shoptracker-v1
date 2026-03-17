# main.py
# This is the ENTRY POINT of the entire application

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from app.database import engine, Base
from app.routers import categories

# We will uncomment these as we build each file:
# from app.routers import purchases
# from app.routers import sales
# from app.routers import dashboard

# Create all database tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ShopTracker API",
    description="Simple shop management for small retail shops in India",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Only categories router for now — others coming soon
app.include_router(categories.router)

# We will uncomment these as we build each file:
# app.include_router(purchases.router)
# app.include_router(sales.router)
# app.include_router(dashboard.router)

@app.get("/api/status")
def get_status():
    return {
        "message": "ShopTracker API is running!",
        "version": "1.0.0",
        "status": "online"
    }

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
FRONTEND_DIR = os.path.abspath(FRONTEND_DIR)

if os.path.exists(FRONTEND_DIR):
    @app.get("/")
    def serve_frontend():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
    app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="static")

# categories.py
# Handles everything related to product categories
# Earrings, Bangles, Hair Clips, Toys, Stationery etc.
#
# API Endpoints:
# POST /categories/         → Create new category
# GET  /categories/         → Get all categories
# GET  /categories/{id}     → Get one category
# PUT  /categories/{id}     → Update category name or price

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.models import Category, Stock

# ─────────────────────────────────────────
# ROUTER SETUP
# ─────────────────────────────────────────
# prefix="/categories" → all endpoints start with /categories
# tags=["Categories"]  → groups them in the API documentation
# Visit http://localhost:8000/docs to see this

router = APIRouter(prefix="/categories", tags=["Categories"])

# ─────────────────────────────────────────
# PYDANTIC MODELS (Data Validators)
# ─────────────────────────────────────────
# These define what data we EXPECT to receive
# Pydantic automatically validates incoming data
# If data doesn't match → returns clear error message

class CategoryCreate(BaseModel):
    # name is required — cannot be empty
    name: str
    # selling_price is optional — can add later
    # Optional[float] means it can be a float OR None
    selling_price: Optional[float] = 0.0

class CategoryUpdate(BaseModel):
    # For updating an existing category
    name: Optional[str] = None
    selling_price: Optional[float] = None

# ─────────────────────────────────────────
# ENDPOINT 1: CREATE CATEGORY
# ─────────────────────────────────────────
# POST /categories/
# Called when shop owner adds a new product type
# Example: Adding "Earrings" for the first time
#
# db: Session = Depends(get_db)
# This means: "give me a database session"
# FastAPI calls get_db() automatically and passes result here
# We don't need to open/close database manually

@router.post("/")
def create_category(category: CategoryCreate, db: Session = Depends(get_db)):

    # Check if category already exists
    # We don't want duplicate "Earrings" categories
    existing = db.query(Category).filter(
        Category.name == category.name
    ).first()

    if existing:
        # HTTP 400 = Bad Request (client made a mistake)
        raise HTTPException(
            status_code=400,
            detail=f"Category '{category.name}' already exists"
        )

    # Create new category object
    new_category = Category(
        name=category.name,
        selling_price=category.selling_price
    )

    # Add to database session and save
    # db.add()    → stage the new record
    # db.commit() → save it to the database file
    # db.refresh() → reload the object to get the auto-generated id
    db.add(new_category)
    db.commit()
    db.refresh(new_category)

    # Automatically create a stock record for this category
    # Every category starts with 0 stock
    # Stock gets updated when purchases are recorded
    new_stock = Stock(
        category_id=new_category.id,
        quantity=0,
        avg_cost=0.0
    )
    db.add(new_stock)
    db.commit()

    return {
        "message": f"Category '{new_category.name}' created successfully",
        "category": {
            "id": new_category.id,
            "name": new_category.name,
            "selling_price": new_category.selling_price,
            "created_at": new_category.created_at
        }
    }

# ─────────────────────────────────────────
# ENDPOINT 2: GET ALL CATEGORIES
# ─────────────────────────────────────────
# GET /categories/
# Returns all categories with their current stock
# Used by: Buy screen dropdown, Sell screen dropdown

@router.get("/")
def get_all_categories(db: Session = Depends(get_db)):

    categories = db.query(Category).all()

    if not categories:
        return {"message": "No categories yet", "categories": []}

    result = []
    for cat in categories:
        # For each category, also get its current stock
        stock = db.query(Stock).filter(
            Stock.category_id == cat.id
        ).first()

        result.append({
            "id": cat.id,
            "name": cat.name,
            "selling_price": cat.selling_price,
            # If stock record exists use its values, otherwise show 0
            "current_stock": stock.quantity if stock else 0,
            "avg_cost": stock.avg_cost if stock else 0,
            "created_at": cat.created_at
        })

    return {
        "total_categories": len(result),
        "categories": result
    }

# ─────────────────────────────────────────
# ENDPOINT 3: GET ONE CATEGORY
# ─────────────────────────────────────────
# GET /categories/{category_id}
# {category_id} is a path parameter
# Example: GET /categories/1 → returns Earrings

@router.get("/{category_id}")
def get_category(category_id: int, db: Session = Depends(get_db)):

    category = db.query(Category).filter(
        Category.id == category_id
    ).first()

    if not category:
        # HTTP 404 = Not Found
        raise HTTPException(
            status_code=404,
            detail=f"Category {category_id} not found"
        )

    stock = db.query(Stock).filter(
        Stock.category_id == category_id
    ).first()

    return {
        "id": category.id,
        "name": category.name,
        "selling_price": category.selling_price,
        "current_stock": stock.quantity if stock else 0,
        "avg_cost": stock.avg_cost if stock else 0,
        "created_at": category.created_at
    }

# ─────────────────────────────────────────
# ENDPOINT 4: UPDATE CATEGORY
# ─────────────────────────────────────────
# PUT /categories/{category_id}
# Used when shop owner wants to:
# → Change category name
# → Update the selling price

@router.put("/{category_id}")
def update_category(
    category_id: int,
    update: CategoryUpdate,
    db: Session = Depends(get_db)
):
    category = db.query(Category).filter(
        Category.id == category_id
    ).first()

    if not category:
        raise HTTPException(
            status_code=404,
            detail=f"Category {category_id} not found"
        )

    # Only update fields that were actually provided
    # If name is None → don't change the name
    # If selling_price is None → don't change the price
    if update.name is not None:
        # Check new name doesn't conflict with existing category
        existing = db.query(Category).filter(
            Category.name == update.name,
            Category.id != category_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Category '{update.name}' already exists"
            )
        category.name = update.name

    if update.selling_price is not None:
        category.selling_price = update.selling_price

    db.commit()
    db.refresh(category)

    return {
        "message": "Category updated successfully",
        "category": {
            "id": category.id,
            "name": category.name,
            "selling_price": category.selling_price
        }
    }

"""API routes initialization."""
from fastapi import APIRouter
from app.api import documents, query, chat

api_router = APIRouter()

api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(query.router, prefix="/query", tags=["query"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])

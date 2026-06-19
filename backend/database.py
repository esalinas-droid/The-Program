"""Shared MongoDB connection — imported by all routers."""
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os

load_dotenv(Path(__file__).parent / '.env')
load_dotenv(Path(__file__).parent / '.env.local', override=False)  # local secrets; K8s env vars take precedence

_client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = _client[os.environ['DB_NAME']]

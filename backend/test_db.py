import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
async def test():
    db = AsyncIOMotorClient('mongodb://localhost:27017')['social_db']
    print(await db.messages.find_one())
asyncio.run(test())

import os
from pymongo import MongoClient

class Config:
    MONGO_URI = os.getenv('MONGODB_URI')
    JWT_SECRET = os.getenv('JWT_SECRET')
    
    @staticmethod
    def get_db():
        client = MongoClient(Config.MONGO_URI)
        return client['social_media_db']
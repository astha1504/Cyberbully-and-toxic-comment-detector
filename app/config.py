import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    SECRET_KEY = os.getenv("SECRET_KEY", "yoursecretkeyhere")
    ALGORITHM = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))
    MODEL_URL = os.getenv("MODEL_URL", "http://localhost:8001/predict")

settings = Settings()

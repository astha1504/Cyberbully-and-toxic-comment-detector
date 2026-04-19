from app.config import Config

def get_users_collection():
    return Config.get_db()['users']

def get_posts_collection():
    return Config.get_db()['posts']

def get_comments_collection():
    return Config.get_db()['comments']

def get_messages_collection():
    return Config.get_db()['messages']

def get_conversations_collection():
    return Config.get_db()['conversations']
from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
from dotenv import load_dotenv
import os

load_dotenv()

socketio = SocketIO(cors_allowed_origins="*")

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.getenv('JWT_SECRET')
    app.config['JWT_SECRET'] = os.getenv('JWT_SECRET')
    
    CORS(app, resources={r"/*": {"origins": "*"}})
    
    from app.routes import auth, posts, users, chat, toxicity
    app.register_blueprint(auth.bp)
    app.register_blueprint(posts.bp)
    app.register_blueprint(users.bp)
    app.register_blueprint(chat.bp)
    app.register_blueprint(toxicity.bp)
    
    from app import socket_events
    socketio.init_app(app)
    
    return app
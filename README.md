#  Socialite - Social Media Platform

A beautiful Instagram-like social media platform built with **React + Vite** (frontend) and **Python Flask + Socket.IO** (backend), with **MongoDB Atlas** as the database.

---

##  Features

| Category | Features |
|----------|---------|
| **Auth** | Register, Login, JWT auth, salted bcrypt passwords |
| **Posts** | Create posts (text + images), like/unlike, delete |
| **Comments** | Add, view, delete comments on posts |
| **Profile** | Bio, profile picture, name/email/password update |
| **Follow** | Follow/unfollow users, followers & following lists |
| **Search** | User search with autocomplete, user suggestion sidebar |
| **Chat** | Real-time messaging via Socket.IO |
| **Real-time** | Typing indicators, message notifications |
| **Theme** | Dark & Light mode with localStorage persistence |
| **Responsive** | Mobile-first, Instagram-like UI |

---

##  Project Structure

```
social media app/
├── frontend/          # React + Vite
└── backend/           # Python Flask + Socket.IO
```

---

##  Quick Start

### 1. Configure MongoDB Atlas

Edit `backend/.env`:
```env
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_key_here
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

> **Get your MongoDB URI:** Go to [MongoDB Atlas](https://cloud.mongodb.com) → Connect → Drivers → Copy the connection string.

> **Cloudinary (image hosting):** Free account at [cloudinary.com](https://cloudinary.com) → Dashboard → copy keys.

### 2. Start the Backend

```powershell
cd backend
pip install -r requirements.txt
python run.py
```
Backend runs at: **http://localhost:5000**

### 3. Start the Frontend

```powershell
cd frontend
npm install
npm run dev
```
Frontend runs at: **http://localhost:5173**

---

##  Tech Stack

### Frontend
- **React 18** + **Vite**
- **React Router v6** — routing
- **Framer Motion** — animations
- **Socket.IO Client** — real-time
- **Axios** — HTTP requests
- **React Hot Toast** — notifications
- **Lucide React** — icons
- **Vanilla CSS** — no frameworks

### Backend
- **Flask** — REST API
- **Flask-SocketIO** — real-time events
- **PyMongo** — MongoDB driver
- **bcrypt** — salted password hashing
- **PyJWT** — token authentication
- **Cloudinary** — image hosting
- **Eventlet** — async worker

### Database (MongoDB Atlas)
| Collection | Purpose |
|-----------|---------|
| `users` | User accounts, followers/following |
| `posts` | Post content, likes |
| `comments` | Post comments |
| `messages` | Chat messages |
| `conversations` | Chat conversations |

---

##  API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|---------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/verify` | Verify token |

### Posts
| Method | Endpoint | Description |
|--------|---------|-------------|
| GET | `/api/posts/` | Get feed posts |
| POST | `/api/posts/` | Create post |
| POST | `/api/posts/:id/like` | Like/unlike post |
| DELETE | `/api/posts/:id` | Delete post |
| GET | `/api/posts/:id/comments` | Get comments |
| POST | `/api/posts/:id/comments` | Add comment |
| DELETE | `/api/posts/comments/:id` | Delete comment |

### Users
| Method | Endpoint | Description |
|--------|---------|-------------|
| GET | `/api/users/profile` | Get own profile |
| GET | `/api/users/profile/:id` | Get user profile |
| PUT | `/api/users/profile/update` | Update profile |
| POST | `/api/users/:id/follow` | Follow user |
| POST | `/api/users/:id/unfollow` | Unfollow user |
| GET | `/api/users/search?q=` | Search users |
| GET | `/api/users/suggestions` | Get suggestions |

### Chat
| Method | Endpoint | Description |
|--------|---------|-------------|
| GET | `/api/chat/conversations` | Get conversations |
| GET | `/api/chat/messages/:id` | Get messages |
| POST | `/api/chat/conversation` | Create conversation |

### Socket.IO Events
| Event | Direction | Description |
|-------|-----------|-------------|
| `join` | Client → Server | Join user's room |
| `send_message` | Client → Server | Send a message |
| `new_message` | Server → Client | Receive message |
| `typing` | Client → Server | Typing status |
| `user_typing` | Server → Client | Typing indicator |
| `message_notification` | Server → Client | New message alert |

---

##  UI Theme

The app supports **Light** and **Dark** mode, toggled from the navbar. Theme is persisted in `localStorage`.

Custom design tokens (in `index.css`):
- Primary: `#0095f6` (Instagram blue)
- Gradient: `#833ab4 → #fd1d1d → #fcb045` (Instagram gradient)
- Dark bg: `#121212`

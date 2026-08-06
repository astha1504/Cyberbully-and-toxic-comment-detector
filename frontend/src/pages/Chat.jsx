import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import {
  getConversations, getMessages, createConversation, searchUsers
} from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Send, ArrowLeft, Moon, Sun, MoreVertical, Phone, Video, Smile, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import AIInterventionModal from '../components/AIInterventionModal';
import './Chat.css';

const DEFAULT_AVATAR = '/placeholder-avatar.svg';

const Chat = () => {
  const { user } = useAuth();
  const { socket, clearNotification } = useSocket();
  const { theme, toggleTheme } = useTheme();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [typing, setTyping] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [toxicityWarning, setToxicityWarning] = useState(null);
  const [showIntervention, setShowIntervention] = useState(false);
  const [interventionText, setInterventionText] = useState('');
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('new_message', handleNewMessage);
      socket.on('user_typing', handleTypingEvent);
      socket.on('toxicity_warning', handleToxicityWarning);
      return () => {
        socket.off('new_message');
        socket.off('user_typing');
        socket.off('toxicity_warning');
      };
    }
  }, [socket, activeConv]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async () => {
    try {
      const { data } = await getConversations();
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations');
    }
    setLoading(false);
  };

  const handleNewMessage = useCallback((message) => {
    if (activeConv && message.conversation_id === activeConv.id) {
      setMessages((prev) => [...prev, message]);
    }
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === message.conversation_id
          ? { ...conv, last_message: message.content, last_message_time: message.created_at }
          : conv
      )
    );
  }, [activeConv]);

  const handleTypingEvent = useCallback((data) => {
    if (activeConv && data.conversation_id === activeConv.id) {
      setTyping(data.is_typing ? data.user_id : null);
    }
  }, [activeConv]);

  const handleToxicityWarning = useCallback((data) => {
    setToxicityWarning(data);
    setNewMessage(data.original_content || '');
    toast.error(data.message || 'Toxic message detected', {
      duration: 6000,
      position: 'top-center',
    });
  }, []);

  const selectConversation = async (conv) => {
    setActiveConv(conv);
    setToxicityWarning(null);
    setShowMobileChat(true);
    clearNotification(conv.id);
    try {
      const { data } = await getMessages(conv.id);
      setMessages(data);
    } catch (err) {
      toast.error('Failed to load messages');
    }
  };

  const sendMessage = async (e, forceSend = false) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !activeConv) return;
    
    if (!forceSend) {
      setInterventionText(newMessage.trim());
      setShowIntervention(true);
      return;
    }
    
    socket?.emit('send_message', {
      conversation_id: activeConv.id,
      sender_id: user.id,
      receiver_id: activeConv.user?.id,
      content: newMessage.trim(),
      ignore_warning: true,
    });
    
    if (toxicityWarning) setToxicityWarning(null);
    setNewMessage('');
    emitTyping(false);
  };

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);
    emitTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emitTyping(false), 2000);
  };

  const emitTyping = (isTyping) => {
    if (socket && activeConv) {
      socket.emit('typing', {
        user_id: user.id,
        receiver_id: activeConv.user?.id,
        conversation_id: activeConv.id,
        is_typing: isTyping,
      });
    }
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.length > 1) {
      try {
        const { data } = await searchUsers(query);
        setSearchResults(data);
      } catch (err) {
        setSearchResults([]);
      }
    } else {
      setSearchResults([]);
    }
  };

  const startConversation = async (otherUser) => {
    try {
      const { data } = await createConversation(otherUser.id);
const conv = {
         id: data.id,
         user: {
           id: otherUser.id,
           username: otherUser.username,
           profile_picture: otherUser.profile_picture,
         },
        last_message: '',
        last_message_time: '',
      };
      setConversations((prev) => {
        const exists = prev.find((c) => c.id === data.id);
        if (exists) return prev;
        return [conv, ...prev];
      });
      selectConversation(conv);
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      toast.error('Failed to start conversation');
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

const filteredConversations = conversations.filter((conv) =>
     conv.user?.username?.toLowerCase().includes(searchQuery.toLowerCase())
   );

  return (
    <div className="chat-page" data-theme={theme}>
      {/* Conversations List */}
      <div className={`chat-sidebar ${showMobileChat ? 'hidden-mobile' : ''}`}>
        <div className="chat-sidebar-header">
          <h2 className="chat-title">Messages</h2>
          <div className="chat-header-actions">
            <button className="chat-theme-btn" onClick={toggleTheme}>
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </div>

        <div className="chat-search">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="chat-search-input"
            id="chat-search"
          />
        </div>

        {showSearch || searchQuery ? (
          <div className="search-results">
            {searchResults.map((u) => (
              <div key={u.id} className="conv-item" onClick={() => startConversation(u)}>
                <img src={u.profile_picture || DEFAULT_AVATAR} alt="" className="conv-avatar" />
                <div className="conv-info">
                  <span className="conv-name">{u.username || 'Unknown User'}</span>
                  <span className="conv-preview">Start a conversation</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="conversations-list">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className={`conv-item ${activeConv?.id === conv.id ? 'active' : ''}`}
                onClick={() => selectConversation(conv)}
              >
                <img src={conv.user?.profile_picture || DEFAULT_AVATAR} alt="" className="conv-avatar" />
                <div className="conv-info">
                  <span className="conv-name">{conv.user?.username || 'Unknown User'}</span>
                  <span className="conv-preview">{conv.last_message || 'No messages yet'}</span>
                </div>
                {conv.last_message_time && (
                  <span className="conv-time">{formatTime(conv.last_message_time)}</span>
                )}
                {conv.unread_count > 0 && (
                  <span className="unread-badge">{conv.unread_count}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

{/* Chat Window */}
       <div className={`chat-main ${!showMobileChat ? 'hidden-mobile' : ''}`}>
         {activeConv ? (
           <>
             <div className="chat-main-header">
               <button className="back-btn-mobile" onClick={() => setShowMobileChat(false)}>
                 <ArrowLeft size={20} />
               </button>
               <img src={activeConv.user?.profile_picture || DEFAULT_AVATAR} alt="" className="chat-header-avatar" />
               <div className="chat-header-info">
                 <span className="chat-header-name">{activeConv.user?.username || 'Unknown User'}</span>
                 {typing && <span className="typing-indicator">typing...</span>}
               </div>
             </div>

             {toxicityWarning && (
               <div className="toxicity-warning-banner" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                   <AlertTriangle size={16} className="warning-icon" />
                   <span>{toxicityWarning.message}</span>
                 </div>
                 <div style={{ display: 'flex', gap: '12px', paddingLeft: '24px' }}>
                   <button 
                     onClick={() => setToxicityWarning(null)} 
                     style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: 'white', borderRadius: '6px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer' }}
                   >
                     Edit Message
                   </button>
                   <button 
                     onClick={(e) => sendMessage(e, true)} 
                     style={{ background: 'white', color: '#ff6b6b', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
                   >
                     Send Anyway
                   </button>
                 </div>
               </div>
             )}

            <div className="messages-container">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  className={`message ${msg.sender_id === user.id ? 'sent' : 'received'}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="message-bubble">
                    <p>{msg.content}</p>
                    <span className="message-time">{formatTime(msg.created_at)}</span>
                  </div>
                </motion.div>
              ))}
              {typing && (
                <div className="message received">
                  <div className="message-bubble typing-bubble">
                    <div className="typing-dots">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form className="message-input-area" onSubmit={sendMessage}>
              <input
                type="text"
                placeholder="Type a message..."
                value={newMessage}
                onChange={handleInputChange}
                className="message-input"
                id="message-input"
              />
              <motion.button
                type="submit"
                className="send-btn"
                disabled={!newMessage.trim()}
                whileTap={{ scale: 0.9 }}
                id="send-message-btn"
              >
                <Send size={18} />
              </motion.button>
            </form>
          </>
        ) : (
          <div className="no-chat-selected">
            <div className="no-chat-icon">💬</div>
            <h3>Your Messages</h3>
            <p>Select a conversation or search for someone to chat with</p>
          </div>
        )}

        <AIInterventionModal
          isOpen={showIntervention}
          onClose={() => setShowIntervention(false)}
          onConfirm={() => sendMessage(null, true)}
          onEdit={(text) => {
            setNewMessage(text);
            setShowIntervention(false);
          }}
          text={interventionText}
          title="Send Message"
          placeholder="Type a message..."
        />
      </div>
    </div>
  );
};

export default Chat;
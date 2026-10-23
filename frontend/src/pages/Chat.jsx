import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import {
  getConversations, getMessages, createConversation, getUserProfile, searchUsers
} from '../services/api';
import { getApiErrorMessage } from '../utils/errorMessages';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Send, ArrowLeft, Moon, Sun, MoreVertical, Phone, Video, Smile, AlertTriangle, Mic
} from 'lucide-react';
import { checkAudioToxicity } from '../services/api';
import toast from 'react-hot-toast';
import AIInterventionModal from '../components/AIInterventionModal';
import LiveToxicityHint from '../components/LiveToxicityHint';
import './Chat.css';

const DEFAULT_AVATAR = '/placeholder-avatar.svg';

const Chat = () => {
  const { user } = useAuth();
  const { socket, clearNotification } = useSocket();
  const { theme, toggleTheme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedUserId = searchParams.get('userId');
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [typing, setTyping] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [toxicityWarning, setToxicityWarning] = useState(null);
  const [showIntervention, setShowIntervention] = useState(false);
  const [interventionText, setInterventionText] = useState('');
  const [revealedMessages, setRevealedMessages] = useState({});
  const [checkingAudio, setCheckingAudio] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const audioInputRef = useRef(null);
  const handledTargetRef = useRef('');
  const conversationsRef = useRef(conversations);
  const activeConvRef = useRef(activeConv);
  const pendingMessagesRef = useRef(new Map());
  conversationsRef.current = conversations;
  activeConvRef.current = activeConv;

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('new_message', handleNewMessage);
      socket.on('user_typing', handleTypingEvent);
      socket.on('toxicity_warning', handleToxicityWarning);
      socket.on('message_error', handleMessageError);
      return () => {
        socket.off('new_message');
        socket.off('user_typing');
        socket.off('toxicity_warning');
        socket.off('message_error');
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
      setConversations(Array.isArray(data) ? data : []);
    } catch (err) {
      setConversations([]);
      toast.error(getApiErrorMessage(err, 'Could not load conversations.'));
    }
    setLoading(false);
  };

  const handleNewMessage = useCallback((message) => {
    const currentConversation = activeConvRef.current;
    const draftMatchesPeer = currentConversation?.isDraft
      && currentConversation.user?.id === message.sender_id
      && message.sender_id !== user?.id;
    const matchesActiveConversation = currentConversation
      && (message.conversation_id === currentConversation.id || draftMatchesPeer);
    const deliveredMessage = { ...message, is_pending: false };
    if (matchesActiveConversation) {
      setMessages((prev) => {
        const pendingIndex = message.client_message_id
          ? prev.findIndex((item) => item.client_message_id === message.client_message_id)
          : prev.findIndex((item) => item.is_pending
            && item.conversation_id === message.conversation_id
            && item.sender_id === message.sender_id
            && item.content === message.content);
        if (pendingIndex >= 0) {
          return prev.map((item, index) => index === pendingIndex ? deliveredMessage : item);
        }
        if (prev.some((item) => item.id === message.id)) return prev;
        return [...prev, deliveredMessage];
      });
    }
    if (message.client_message_id) {
      pendingMessagesRef.current.delete(message.client_message_id);
    } else {
      const fallbackPendingId = [...pendingMessagesRef.current.entries()]
        .find(([, pending]) => pending.conversation_id === message.conversation_id
          && pending.sender_id === message.sender_id
          && pending.content === message.content)?.[0];
      if (fallbackPendingId) pendingMessagesRef.current.delete(fallbackPendingId);
    }
    const draftConversation = currentConversation?.id === message.conversation_id
      ? currentConversation
      : draftMatchesPeer
        ? { ...currentConversation, id: message.conversation_id, isDraft: false }
        : null;
    if (draftMatchesPeer) {
      activeConvRef.current = draftConversation;
      setActiveConv(draftConversation);
    }

    const alreadyListed = conversationsRef.current.some((conv) => conv.id === message.conversation_id);
    if (message.sender_id !== user?.id && !alreadyListed) {
      getConversations()
        .then(({ data }) => setConversations(Array.isArray(data) ? data : []))
        .catch((error) => toast.error(getApiErrorMessage(error, 'Could not refresh conversations.')));
    }
    setConversations((prev) => {
      const current = prev.find((conv) => conv.id === message.conversation_id) || draftConversation;
      if (!current) return prev;
      const updated = {
        ...current,
        id: message.conversation_id,
        isDraft: false,
        last_message: message.content,
        last_message_time: message.created_at,
      };
      return [updated, ...prev.filter((conv) => conv.id !== message.conversation_id)];
    });
  }, [user]);

  const handleTypingEvent = useCallback((data) => {
    if (activeConv && data.conversation_id === activeConv.id) {
      setTyping(data.is_typing ? data.user_id : null);
    }
  }, [activeConv]);

  const handleToxicityWarning = useCallback((data) => {
    if (data.client_message_id) {
      pendingMessagesRef.current.delete(data.client_message_id);
      setMessages((prev) => prev.filter((message) => message.client_message_id !== data.client_message_id));
    }
    setToxicityWarning(data);
    setNewMessage(data.original_content || '');
    toast.error(data.message || 'Toxic message detected', {
      duration: 6000,
      position: 'top-center',
    });
  }, []);

  const handleMessageError = useCallback((data) => {
    const clientMessageId = data.client_message_id;
    if (!clientMessageId) return;
    const pendingMessage = pendingMessagesRef.current.get(clientMessageId);
    pendingMessagesRef.current.delete(clientMessageId);
    setMessages((prev) => prev.filter((message) => message.client_message_id !== clientMessageId));
    if (pendingMessage) {
      setNewMessage((current) => current || pendingMessage.content);
    }
  }, []);

  const selectConversation = useCallback(async (conv) => {
    activeConvRef.current = conv;
    setActiveConv(conv);
    setMessages([]);
    setToxicityWarning(null);
    setTyping(null);
    setShowMobileChat(true);
    if (!conv.id) return;
    clearNotification(conv.id);
    try {
      const { data } = await getMessages(conv.id);
      setMessages(data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not load messages.'));
    }
  }, [clearNotification]);

  const openConversationWith = useCallback((otherUser) => {
    if (!otherUser?.id) return;
    if (otherUser.id === (user?.id || user?._id)) {
      toast.error('You cannot start a conversation with yourself.');
      return;
    }
    const existing = conversations.find((conv) => conv.user?.id === otherUser.id);
    const conversation = existing || {
      id: null,
      user: {
        id: otherUser.id,
        username: otherUser.username,
        name: otherUser.name,
        profile_picture: otherUser.profile_picture,
      },
      last_message: '',
      last_message_time: '',
      unread_count: 0,
      isDraft: true,
    };
    selectConversation(conversation);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
  }, [conversations, selectConversation, user]);

  useEffect(() => {
    if (!requestedUserId) {
      handledTargetRef.current = '';
      return;
    }
    if (loading || handledTargetRef.current === requestedUserId) return;
    handledTargetRef.current = requestedUserId;

    const openRequestedUser = async () => {
      try {
        const existing = conversations.find((conv) => conv.user?.id === requestedUserId);
        if (existing) {
          await selectConversation(existing);
        } else {
          const { data } = await getUserProfile(requestedUserId);
          openConversationWith(data.user);
        }
      } catch (error) {
        toast.error(getApiErrorMessage(error, 'Could not open this conversation.'));
      } finally {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('userId');
        setSearchParams(nextParams, { replace: true });
      }
    };

    openRequestedUser();
  }, [requestedUserId, loading, conversations, selectConversation, openConversationWith, searchParams, setSearchParams]);

  const sendMessage = async (e, approvedText = newMessage, warningAccepted = false) => {
    if (e) e.preventDefault();
    const messageText = approvedText.trim();
    if (!messageText || !activeConv) return;

    if (!socket?.isConnected?.()) {
      toast.error('Chat is connecting. Please try sending again in a moment.');
      return;
    }

    const clientMessageId = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pendingMessage = {
      id: clientMessageId,
      client_message_id: clientMessageId,
      conversation_id: activeConv.id || null,
      sender_id: user.id,
      content: messageText,
      created_at: new Date().toISOString(),
      moderation_status: 'pending',
      is_pending: true,
    };
    pendingMessagesRef.current.set(clientMessageId, pendingMessage);
    setMessages((prev) => [...prev, pendingMessage]);
    setNewMessage('');

    let conversation = activeConv;
    if (!conversation.id) {
      try {
        const { data } = await createConversation(conversation.user.id);
        conversation = { ...conversation, id: data.id, isDraft: false };
        activeConvRef.current = conversation;
        setActiveConv(conversation);
        pendingMessagesRef.current.set(clientMessageId, {
          ...pendingMessage,
          conversation_id: conversation.id,
        });
        setMessages((prev) => prev.map((message) => message.client_message_id === clientMessageId
          ? { ...message, conversation_id: conversation.id }
          : message));
      } catch (error) {
        pendingMessagesRef.current.delete(clientMessageId);
        setMessages((prev) => prev.filter((message) => message.client_message_id !== clientMessageId));
        setNewMessage((current) => current || messageText);
        toast.error(getApiErrorMessage(error, 'Could not start this conversation.'));
        return;
      }
    }

    if (!socket?.isConnected?.()) {
      pendingMessagesRef.current.delete(clientMessageId);
      setMessages((prev) => prev.filter((message) => message.client_message_id !== clientMessageId));
      setNewMessage((current) => current || messageText);
      toast.error('Chat disconnected before the message was sent. Please try again.');
      return;
    }

    const sent = socket.emit('send_message', {
      client_message_id: clientMessageId,
      conversation_id: conversation.id,
      sender_id: user.id,
      receiver_id: conversation.user?.id,
      content: messageText,
      ignore_warning: warningAccepted,
    });

    if (!sent) {
      pendingMessagesRef.current.delete(clientMessageId);
      setMessages((prev) => prev.filter((message) => message.client_message_id !== clientMessageId));
      setNewMessage((current) => current || messageText);
      toast.error('Chat disconnected before the message was sent. Please try again.');
      return;
    }
    
    if (toxicityWarning) setToxicityWarning(null);
    emitTyping(false);
  };

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);
    emitTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emitTyping(false), 2000);
  };

  const handleAudioSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Voice notes must be 20 MB or smaller');
      return;
    }
    setCheckingAudio(true);
    try {
      const { data } = await checkAudioToxicity(file);
      if (!data.transcription?.trim()) {
        toast.error('No speech was detected in that recording');
        return;
      }
      setInterventionText(data.transcription.trim());
      setShowIntervention(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not check this voice note.'));
    } finally {
      setCheckingAudio(false);
    }
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
      setSearchError('');
      setSearchLoading(true);
      try {
        const { data } = await searchUsers(query);
        const currentUserId = user?.id || user?._id;
        setSearchResults(Array.isArray(data)
          ? data.filter((person) => person.id !== currentUserId)
          : []);
      } catch (err) {
        setSearchResults([]);
        setSearchError(getApiErrorMessage(err, 'Could not search for people.'));
      } finally {
        setSearchLoading(false);
      }
    } else {
      setSearchResults([]);
      setSearchError('');
      setSearchLoading(false);
    }
  };

  const startConversation = openConversationWith;

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
            placeholder="Search people by username..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="chat-search-input"
            id="chat-search"
          />
        </div>

        {showSearch || searchQuery ? (
          <div className="search-results">
            {searchError ? (
              <div className="chat-search-error" role="alert">{searchError}</div>
            ) : searchLoading ? (
              <div className="chat-list-empty">Searching people…</div>
            ) : searchQuery.length < 2 ? (
              <div className="chat-list-empty">Type at least two characters to find someone.</div>
            ) : searchResults.length === 0 ? (
              <div className="chat-list-empty">No people found. Check the username and try again.</div>
            ) : searchResults.map((person) => (
              <button key={person.id} type="button" className="conv-item conv-item-button" onClick={() => startConversation(person)}>
                <img src={person.profile_picture || DEFAULT_AVATAR} alt="" className="conv-avatar" />
                <span className="conv-info">
                  <span className="conv-name">{person.username || 'Unknown User'}</span>
                  <span className="conv-preview">Open chat · conversation saves after your first message</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="conversations-list">
            {loading ? (
              <div className="chat-list-empty">Loading conversations…</div>
            ) : filteredConversations.length === 0 ? (
              <div className="chat-list-empty">
                <strong>No messages yet</strong>
                <span>Search for someone above, or message them from a profile, follower, or following list.</span>
              </div>
            ) : filteredConversations.map((conv) => (
              <button
                type="button"
                key={conv.id}
                className={`conv-item conv-item-button ${activeConv?.id === conv.id ? 'active' : ''}`}
                onClick={() => selectConversation(conv)}
              >
                <img src={conv.user?.profile_picture || DEFAULT_AVATAR} alt="" className="conv-avatar" />
                <span className="conv-info">
                  <span className="conv-name">{conv.user?.username || 'Unknown User'}</span>
                  <span className="conv-preview">{conv.last_message || 'No messages yet'}</span>
                </span>
                {conv.last_message_time && (
                  <span className="conv-time">{formatTime(conv.last_message_time)}</span>
                )}
                {conv.unread_count > 0 && (
                  <span className="unread-badge">{conv.unread_count}</span>
                )}
              </button>
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
                     onClick={(e) => sendMessage(e, newMessage, true)}
                     style={{ background: 'white', color: '#ff6b6b', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
                   >
                     Send Anyway
                   </button>
                 </div>
               </div>
             )}

            <div className="messages-container">
              {messages.length === 0 && (
                <div className="empty-thread">
                  <strong>Start the conversation</strong>
                  <span>Send your first message. This chat will appear in your message list after it is sent.</span>
                </div>
              )}
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  className={`message ${msg.sender_id === user.id ? 'sent' : 'received'}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="message-bubble">
                    {msg.is_toxic && msg.sender_id !== user.id && !revealedMessages[msg.id] ? (
                      <div className="flagged-message-cover">
                        <span>Potentially harmful message hidden</span>
                        <button
                          type="button"
                          onClick={() => setRevealedMessages((prev) => ({ ...prev, [msg.id]: true }))}
                        >
                          Reveal
                        </button>
                      </div>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                    {msg.is_toxic && (
                      <span className="message-moderation-note">
                        {msg.user_override ? 'Sent after a safety warning' : 'Flagged by the safety check'}
                      </span>
                    )}
                    {msg.moderation_status === 'unavailable' && (
                      <span className="message-moderation-note">Safety scan unavailable for this message</span>
                    )}
                    <span className="message-time">
                      {msg.is_pending ? 'Sending…' : formatTime(msg.created_at)}
                    </span>
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

            <div className="live-chat-hint"><LiveToxicityHint text={newMessage} /></div>
            <form className="message-input-area" onSubmit={sendMessage}>
              <button
                type="button"
                className="voice-check-btn"
                aria-label="Transcribe and check voice note; audio is sent to the configured transcription provider"
                title="Transcribe and check voice note"
                disabled={checkingAudio || !activeConv}
                onClick={() => audioInputRef.current?.click()}
              >
                {checkingAudio ? <span className="voice-check-spinner" /> : <Mic size={18} />}
              </button>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,video/mp4,video/webm"
                hidden
                onChange={handleAudioSelect}
              />
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
            <p>Search by username or start a chat from a profile, follower, or following list.</p>
          </div>
        )}

        <AIInterventionModal
          isOpen={showIntervention}
          onClose={() => setShowIntervention(false)}
          onConfirm={(approvedText, decision) => sendMessage(null, approvedText, decision?.warningAccepted)}
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

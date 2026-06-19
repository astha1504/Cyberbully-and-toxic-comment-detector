import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPost } from '../services/api';
import { motion } from 'framer-motion';
import { ImagePlus, X, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import './CreatePost.css';

const CreatePost = () => {
  const [caption, setCaption] = useState('');
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef();
  const navigate = useNavigate();

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length + images.length > 5) {
      toast.error('Maximum 5 images allowed');
      return;
    }
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImages((prev) => [...prev, reader.result]);
        setPreviews((prev) => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!caption && images.length === 0) {
      toast.error('Add a caption or image');
      return;
    }
    setLoading(true);
    try {
      await createPost({ caption, images });
      toast.success('Post created!');
      navigate('/');
    } catch (err) {
      toast.error('Failed to create post');
    }
    setLoading(false);
  };

  return (
    <div className="create-page">
      <motion.div
        className="create-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="create-title">Create New Post</h2>

        <form className="create-form" onSubmit={handleSubmit} id="create-post-form">
          {/* Image Upload Area */}
          <div
            className={`upload-area ${previews.length > 0 ? 'has-images' : ''}`}
            onClick={() => fileInputRef.current?.click()}
          >
            {previews.length === 0 ? (
              <div className="upload-placeholder">
                <ImagePlus size={48} strokeWidth={1.5} />
                <p>Click to upload images</p>
                <span>Maximum 5 images</span>
              </div>
            ) : (
              <div className="preview-grid">
                {previews.map((preview, i) => (
                  <div key={i} className="preview-item">
                    <img src={preview} alt="" />
                    <button
                      type="button"
                      className="remove-preview"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(i);
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {previews.length < 5 && (
                  <div className="add-more">
                    <ImagePlus size={24} />
                  </div>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleImageSelect}
            />
          </div>

          {/* Caption */}
          <textarea
            className="caption-input"
            placeholder="Write a caption..."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            id="post-caption"
          />

          <motion.button
            type="submit"
            className="create-btn"
            disabled={loading}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            id="create-post-submit"
          >
            {loading ? (
              <div className="spinner"></div>
            ) : (
              <>
                <Send size={18} />
                <span>Share Post</span>
              </>
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
};

export default CreatePost;

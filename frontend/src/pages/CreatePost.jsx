import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPost } from '../services/api';
import { getApiErrorMessage } from '../utils/errorMessages';
import { motion } from 'framer-motion';
import { ImagePlus, X, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import AIInterventionModal from '../components/AIInterventionModal';
import LiveToxicityHint from '../components/LiveToxicityHint';
import './CreatePost.css';

const CreatePost = () => {
  const [caption, setCaption] = useState('');
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showIntervention, setShowIntervention] = useState(false);
  const [pendingCaption, setPendingCaption] = useState('');
  const fileInputRef = useRef();
  const navigate = useNavigate();

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    e.target.value = '';
    const validFiles = files.filter((file) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        toast.error('Use JPEG, PNG, or WEBP images for OCR moderation');
        return false;
      }
      if (file.size > 3 * 1024 * 1024) {
        toast.error('Each image must be 3 MB or smaller');
        return false;
      }
      return true;
    });
    if (validFiles.length + images.length > 5) {
      toast.error('Maximum 5 images allowed');
      return;
    }
    const currentBytes = images.reduce((total, image) => {
      const encoded = image.split(',')[1] || '';
      return total + Math.ceil(encoded.length * 3 / 4);
    }, 0);
    const combinedBytes = currentBytes + validFiles.reduce((total, file) => total + file.size, 0);
    if (combinedBytes > 9 * 1024 * 1024) {
      toast.error('Keep all images in one post under 9 MB total');
      return;
    }
    validFiles.forEach((file) => {
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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!caption.trim() && images.length === 0) {
      toast.error('Add a caption or image');
      return;
    }

    setPendingCaption(caption.trim());
    setShowIntervention(true);
  };

  const submitPost = async (finalCaption) => {
    setLoading(true);
    try {
      const res = await createPost({ caption: finalCaption, images });
      toast.success('Post created!');
      setCaption('');
      setImages([]);
      setPreviews([]);
      navigate('/', { state: { newPost: res.data } });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Post could not be created. Please try again.'));
    } finally {
      setLoading(false);
    }
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

        <form className="create-form" onSubmit={handleSubmit}>
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
              accept="image/jpeg,image/png,image/webp"
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
          <LiveToxicityHint text={caption} />

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
        <AIInterventionModal
          isOpen={showIntervention}
          onClose={() => setShowIntervention(false)}
          onConfirm={submitPost}
          onEdit={setCaption}
          text={pendingCaption}
          images={images}
          title="Create Post"
          placeholder="What's on your mind?"
        />
      </motion.div>
    </div>
  );
};

export default CreatePost;

import { useState, useEffect, useRef } from 'react';
import { X, Search, Image, Loader2, ExternalLink, Check } from 'lucide-react';
import './ImageSearchModal.css';

// Unsplash API configuration
// Note: For production, use your own API key from https://unsplash.com/developers
const UNSPLASH_ACCESS_KEY = 'DEMO_KEY'; // Demo mode - limited results
const UNSPLASH_API_URL = 'https://api.unsplash.com/search/photos';

// Sample image database for demo/offline mode
const sampleImages = {
  coffee: [
    { id: 1, urls: { thumb: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=200', regular: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=500' }, alt_description: 'Premium Coffee Beans', user: { name: 'Coffee Co' } },
    { id: 2, urls: { thumb: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=200', regular: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500' }, alt_description: 'Coffee Cup', user: { name: 'Coffee Co' } },
    { id: 3, urls: { thumb: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=200', regular: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500' }, alt_description: 'Coffee Shop', user: { name: 'Coffee Co' } },
    { id: 4, urls: { thumb: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=200', regular: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=500' }, alt_description: 'Coffee Beans', user: { name: 'Coffee Co' } },
    { id: 5, urls: { thumb: 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?w=200', regular: 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?w=500' }, alt_description: 'Latte Art', user: { name: 'Coffee Co' } },
    { id: 6, urls: { thumb: 'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=200', regular: 'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=500' }, alt_description: 'Espresso', user: { name: 'Coffee Co' } },
  ],
  equipment: [
    { id: 7, urls: { thumb: 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=200', regular: 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=500' }, alt_description: 'Espresso Machine', user: { name: 'Equipment Co' } },
    { id: 8, urls: { thumb: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=200', regular: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500' }, alt_description: 'Milk Frother', user: { name: 'Equipment Co' } },
    { id: 9, urls: { thumb: 'https://images.unsplash.com/photo-1611564068499-1f81d6ccf7ee?w=200', regular: 'https://images.unsplash.com/photo-1611564068499-1f81d6ccf7ee?w=500' }, alt_description: 'Coffee Grinder', user: { name: 'Equipment Co' } },
    { id: 10, urls: { thumb: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=200', regular: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=500' }, alt_description: 'Coffee Mug', user: { name: 'Equipment Co' } },
  ],
  tea: [
    { id: 13, urls: { thumb: 'https://images.unsplash.com/photo-1597318167726-f79e68c7e4b3?w=200', regular: 'https://images.unsplash.com/photo-1597318167726-f79e68c7e4b3?w=500' }, alt_description: 'Tea Collection', user: { name: 'Tea Co' } },
    { id: 14, urls: { thumb: 'https://images.unsplash.com/photo-1564890369478-c5c31472a7f6?w=200', regular: 'https://images.unsplash.com/photo-1564890369478-c5c31472a7f6?w=500' }, alt_description: 'Green Tea', user: { name: 'Tea Co' } },
  ],
  default: [
    { id: 23, urls: { thumb: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=200', regular: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=500' }, alt_description: 'Coffee Beans', user: { name: 'Photo Co' } },
    { id: 24, urls: { thumb: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=200', regular: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=500' }, alt_description: 'Coffee Pouring', user: { name: 'Photo Co' } },
    { id: 25, urls: { thumb: 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=200', regular: 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=500' }, alt_description: 'Coffee beans background', user: { name: 'Photo Co' } },
  ]
};

function ImageSearchModal({ onClose, onSelectImage }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    // Focus search input on mount
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const searchImages = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    
    try {
      // Try to search using Unsplash API
      if (UNSPLASH_ACCESS_KEY && UNSPLASH_ACCESS_KEY !== 'DEMO_KEY') {
        const response = await fetch(
          `${UNSPLASH_API_URL}?query=${encodeURIComponent(searchQuery)}&per_page=20&orientation=landscape`,
          {
            headers: {
              'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`
            }
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          const unsplashResults = data.results.map((img, index) => ({
            id: `unsplash-${img.id}`,
            urls: img.urls,
            alt_description: img.alt_description || 'Unsplash Image',
            user: img.user,
            score: 100 - index * 2, // Relevance score based on API order
            fromApi: true
          }));
          setSearchResults(unsplashResults);
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.log('Unsplash API not available, using local database');
    }

    // Fall back to local database search with enhanced algorithm
    const query = searchQuery.toLowerCase().trim();
    const queryTerms = query.split(/\s+/).filter(term => term.length > 0);
    let results = [];
    const scoredResults = [];

    // Search through sample images with scoring
    Object.keys(sampleImages).forEach(category => {
      sampleImages[category].forEach(image => {
        const title = (image.alt_description || '').toLowerCase();
        let score = 0;

        // Exact match
        if (title === query) {
          score = 100;
        } else if (title.startsWith(query)) {
          score = 80;
        } else {
          queryTerms.forEach(term => {
            if (title.includes(term)) {
              score += 30;
            }
            if (category.includes(term)) {
              score += 20;
            }
          });
        }

        // Fuzzy matching
        queryTerms.forEach(term => {
          if (term.length >= 3) {
            const distance = levenshteinDistance(term, title);
            const similarity = 1 - (distance / Math.max(term.length, title.length));
            if (similarity > 0.6) {
              score += Math.round(similarity * 25);
            }
          }
        });

        if (score > 0) {
          scoredResults.push({ ...image, score, matchedTerms: queryTerms });
        }
      });
    });

    scoredResults.sort((a, b) => b.score - a.score);
    results = scoredResults;

    if (results.length === 0) {
      results = [...sampleImages.default];
    }

    setSearchResults(results);
    setLoading(false);
  };

  // Levenshtein distance algorithm for fuzzy matching
  const levenshteinDistance = (str1, str2) => {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  };

  const handleSearch = (e) => {
    e.preventDefault();
    searchImages();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      searchImages();
    }
  };

  const handleImageSelect = (image) => {
    setSelectedImage(image);
    setPreviewImage(image.urls?.regular || image.url);
  };

  const handleConfirmSelection = () => {
    if (selectedImage) {
      onSelectImage(selectedImage.urls?.regular || selectedImage.url);
      onClose();
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const imageUrl = e.dataTransfer.getData('text/plain');
    if (imageUrl) {
      setPreviewImage(imageUrl);
      setSelectedImage({ url: imageUrl, title: 'Dragged Image' });
    }
  };

  const handleExternalSearch = () => {
    // Open external image search in new tab
    const query = searchQuery || 'coffee product images';
    window.open(`https://images.google.com/search?q=${encodeURIComponent(query)}&tbm=isch`, '_blank');
  };

  return (
    <div className="image-search-overlay">
      <div className="image-search-modal fade-in-up">
        <div className="image-search-header">
          <h2><Image size={24} /> Search Web for Images</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="image-search-content">
          {/* Search Section */}
          <form onSubmit={handleSearch} className="search-form">
            <div className="search-input-wrapper">
              <Search size={20} className="search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Search for images (e.g., 'coffee beans', 'espresso machine')"
                className="search-input"
              />
              <button type="submit" className="search-btn" disabled={loading}>
                {loading ? <Loader2 size={20} className="spin" /> : 'Search'}
              </button>
            </div>
            <button type="button" className="external-search-btn" onClick={handleExternalSearch}>
              <ExternalLink size={16} /> Search on Google Images
            </button>
          </form>

          <div className="image-search-main">
            {/* Image Grid */}
            <div className="image-grid-section">
              <h3>Search Results</h3>
              {loading ? (
                <div className="loading-state">
                  <Loader2 size={40} className="spin" />
                  <p>Searching for images...</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="empty-state">
                  <Image size={48} />
                  <p>Enter a search term to find images</p>
                  <span>Try searching for: coffee, tea, equipment, mug, etc.</span>
                </div>
              ) : (
                <div className="image-grid">
                  {searchResults.map((image) => (
                    <div
                      key={image.id}
                      className={`image-item ${selectedImage?.id === image.id ? 'selected' : ''}`}
                      onClick={() => handleImageSelect(image)}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', image.urls?.regular || image.url)}
                    >
                      <img 
                        src={image.urls?.thumb || image.thumbnail} 
                        alt={image.alt_description || image.title}
                        loading="lazy"
                      />
                      <div className="image-overlay">
                        <span title={image.alt_description || image.title}>
                          {image.alt_description || image.title}
                        </span>
                        {selectedImage?.id === image.id && <Check size={20} />}
                      </div>
                      {image.fromApi && (
                        <div className="api-badge" title="Powered by Unsplash">
                          <Image size={12} />
                        </div>
                      )}
                      {image.score > 0 && !image.fromApi && (
                        <div className="relevance-score" title={`Relevance: ${Math.round(image.score)}%`}>
                          {Math.round(image.score)}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preview Section */}
            <div className="preview-section">
              <h3>Selected Image</h3>
              <div
                className={`preview-container ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                {previewImage ? (
                  <>
                    <img src={previewImage} alt="Preview" className="preview-image" onError={(e) => e.target.src = '/logo.png'} />
                    <div className="preview-url">
                      <label>Image URL:</label>
                      <input type="text" value={previewImage} readOnly />
                    </div>
                    <button
                      className="use-image-btn"
                      onClick={handleConfirmSelection}
                      disabled={!previewImage}
                    >
                      Use This Image
                    </button>
                  </>
                ) : (
                  <div className="preview-placeholder">
                    <Image size={48} />
                    <p>Select an image from the results</p>
                    <span>or drag and drop an image URL here</span>
                  </div>
                )}
              </div>

              {dragActive && (
                <div className="drop-overlay">
                  <Image size={32} />
                  <p>Drop image here</p>
                </div>
              )}
            </div>
          </div>

          {/* Manual URL Entry */}
          <div className="manual-entry-section">
            <h3>Or enter image URL manually</h3>
            <div className="manual-url-input">
              <input
                type="url"
                value={previewImage || ''}
                onChange={(e) => setPreviewImage(e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
              <button
                className="use-url-btn"
                onClick={() => {
                  if (previewImage) {
                    onSelectImage(previewImage);
                    onClose();
                  }
                }}
                disabled={!previewImage}
              >
                Use URL
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImageSearchModal;

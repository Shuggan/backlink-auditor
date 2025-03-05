import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import './App.css';
import { FaFileUpload, FaPaperPlane, FaClipboard, FaArrowLeft, FaSpinner, FaExclamationTriangle } from 'react-icons/fa';
import workerCode from './workerSetup';

// Create worker in a way that handles errors
const createWorker = () => {
  try {
    // Create a blob URL from the worker code
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    return new Worker(workerUrl);
  } catch (error) {
    console.error('Failed to create worker:', error);
    return null;
  }
};

function App() {
  // State management
  const [companyName, setCompanyName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [results, setResults] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [worker, setWorker] = useState(null);
  
  // Memoize keyword list to avoid unnecessary recalculations
  const keywordList = useMemo(() => 
    keywords.split('\n').map(keyword => keyword.trim()).filter(Boolean),
    [keywords]
  );
  
  const fileInputRef = useRef(null);
  const maxFileSize = 50 * 1024 * 1024; // 50MB in bytes

  // Initialize worker
  useEffect(() => {
    const newWorker = createWorker();
    setWorker(newWorker);
    
    return () => {
      // Clean up worker on component unmount
      if (newWorker) {
        newWorker.terminate();
      }
    };
  }, []);

  // Set up worker message handler
  useEffect(() => {
    if (!worker) return;
    
    const handleWorkerMessage = (e) => {
      const response = e.data;
      
      if (response.success) {
        setResults(response.results);
        setShowResults(true);
      } else {
        setError(response.error || 'An error occurred during processing');
      }
      
      setIsLoading(false);
    };
    
    worker.onmessage = handleWorkerMessage;
    
    worker.onerror = (error) => {
      console.error('Worker error:', error);
      setError('Worker error: ' + (error.message || 'Unknown error'));
      setIsLoading(false);
    };
  }, [worker]);

  const handleFileChange = useCallback((event) => {
    const file = event.target.files[0];
    
    if (!file) return;
    
    // Reset error state
    setError(null);
    
    // Validate file size
    if (file.size > maxFileSize) {
      setError(`File size exceeds the maximum limit of 50MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`);
      return;
    }
    
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a CSV file.');
      return;
    }
    
    // Check if the file is different from the current one
    if (file.name !== fileName) {
      setCsvFile(file);
      setFileName(file.name);
      setIsFileUploaded(true);
    }
  }, [fileName, maxFileSize]);

  const resetFileInput = useCallback(() => {
    setCsvFile(null);
    setFileName('');
    setIsFileUploaded(false);
    
    // Reset the file input element
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    
    // Reset error state
    setError(null);
    
    // Validate inputs
    if (!companyName.trim()) {
      setError('Please enter a company name.');
      return;
    }
    
    if (!websiteUrl.trim()) {
      setError('Please enter a website URL.');
      return;
    }
    
    if (!csvFile) {
      setError('Please upload a CSV file.');
      return;
    }
    
    if (!worker) {
      setError('Web worker is not available. Please try refreshing the page.');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          
          // Send data to the worker
          worker.postMessage({ 
            csvText: text, 
            companyName: companyName.trim(),
            websiteUrl: websiteUrl.trim(),
            keywordList 
          });
        } catch (error) {
          console.error('Error processing file:', error);
          setError('Error processing file: ' + (error.message || 'Unknown error'));
          setIsLoading(false);
        }
      };
      
      reader.onerror = (error) => {
        console.error('Error reading file:', error);
        setError('Error reading file: ' + (error.message || 'Unknown error'));
        setIsLoading(false);
      };
      
      reader.readAsText(csvFile);
    } catch (error) {
      console.error('Error submitting form:', error);
      setError('Error submitting form: ' + (error.message || 'Unknown error'));
      setIsLoading(false);
    }
  }, [companyName, websiteUrl, csvFile, worker, keywordList]);

  const handleCopyResults = useCallback(() => {
    if (!results) return;
    
    try {
      const resultsText = `
${results.brandedAnchors}
${results.nakedUrlAnchors}
${results.exactMatch}
${results.partialMatch}
${results.emptyAnchors}

${results.generic}
${results.miscellaneous}
      `;
      
      navigator.clipboard.writeText(resultsText.trim())
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(err => {
          console.error("Failed to copy: ", err);
          setError('Failed to copy results to clipboard.');
        });
    } catch (error) {
      console.error('Error copying results:', error);
      setError('Error copying results: ' + (error.message || 'Unknown error'));
    }
  }, [results]);

  const handleGoBack = useCallback(() => {
    setShowResults(false);
    setResults(null);
    setError(null);
  }, []);

  const normalizeUrl = useCallback((url) => {
    if (!url) return '';
    
    try {
      // Remove protocol (http, https)
      let normalized = url.replace(/(^\w+:|^)\/\//, '');
      // Remove www
      normalized = normalized.replace(/^www\./, '');
      // Remove any slugs or paths
      normalized = normalized.split('/')[0];
      return normalized;
    } catch (error) {
      console.error('Error normalizing URL:', error);
      return url; // Return original URL if there's an error
    }
  }, []);

  const handleWebsiteUrlChange = useCallback((e) => {
    const normalizedUrl = normalizeUrl(e.target.value);
    setWebsiteUrl(normalizedUrl);
  }, [normalizeUrl]);

  // Error display component
  const ErrorMessage = () => {
    if (!error) return null;
    
    return (
      <div className="error-message">
        <FaExclamationTriangle className="error-icon" />
        <p>{error}</p>
        <button 
          className="error-dismiss" 
          onClick={() => setError(null)}
          aria-label="Dismiss error"
        >
          ×
        </button>
      </div>
    );
  };

  return (
    <div className="App">
      <div className="overlay"></div>
      <div className="container">
        <div className="left-container">
          <h2>Anchor Text Analysis</h2>
          <ol style={{ textAlign: 'left' }}>
            <li className="step-item">
              <strong>Insert the Competitor name</strong>
              <ul>
                <li>Use the base company name only</li>
                <li>E.g. Jemon Cranes -&gt; Jenmon</li>
                <li>Bespoke Photography SG -&gt; Bespoke Photography</li>
              </ul>
            </li>
            <li className="step-item">
              <strong>Insert the website URL</strong>
              <ul>
                <li>Just use the basic homepage URL</li>
              </ul>
            </li>
            <li className="step-item">
              <strong>Upload the keywords from the keyword research sheet</strong>
              <ul>
                <li>Up to 100 lines (For premium clients)</li>
                <li>Make sure each is on a new line</li>
                <li>No commas</li>
              </ul>
            </li>
            <li className="step-item">
              <strong>Upload the CSV File from SE Ranking</strong>
              <ul>
                <li>Backlinks &gt; Backlink Checker &gt; Select Report &gt; Anchor Texts &gt; Export</li>
                <li>Download CSV format and upload on the right</li>
              </ul>
            </li>
            <li className="step-item">
              <strong>Copy the results and paste into the backlink competitor research section</strong>
            </li>
          </ol>
        </div>
        <div className="right-container">
          {/* Error message display */}
          <ErrorMessage />
          
          {showResults ? (
            <div>
              <h2>Results</h2>
              <table style={{ width: '100%', maxWidth: '500px', borderCollapse: 'collapse', margin: '0 auto 20px auto' }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #d1d1d1', padding: '8px' }}>Type</th>
                    <th style={{ border: '1px solid #d1d1d1', padding: '8px', textAlign: 'center' }}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px' }}>Branded</td>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px', textAlign: 'center' }}>{results.brandedAnchors}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px' }}>Naked URL</td>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px', textAlign: 'center' }}>{results.nakedUrlAnchors}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px' }}>Exact Match</td>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px', textAlign: 'center' }}>{results.exactMatch}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px' }}>Phrase Match</td>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px', textAlign: 'center' }}>{results.partialMatch}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px' }}>Empty Anchors</td>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px', textAlign: 'center' }}>{results.emptyAnchors}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px' }}>Generic</td>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px', textAlign: 'center' }}>{results.generic}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px' }}>Miscellaneous</td>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px', textAlign: 'center' }}>{results.miscellaneous}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px', fontWeight: 'bold' }}>Total</td>
                    <td style={{ border: '1px solid #d1d1d1', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{results.totalAnchors}</td>
                  </tr>
                </tbody>
              </table>
              <div className="results-buttons">
                <button onClick={handleCopyResults} disabled={!results}>
                  {copied ? 'Copied!' : <><FaClipboard style={{ marginRight: '5px' }} /> Copy Results</>}
                </button>
                <button onClick={handleGoBack}>
                  <FaArrowLeft style={{ marginRight: '5px' }} /> Go Back
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '20px' }}>
                <label htmlFor="companyName">
                  Company Name:
                  <input
                    type="text"
                    id="companyName"
                    placeholder="Company name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </label>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label htmlFor="websiteUrl">
                  Website URL:
                  <input
                    type="text"
                    id="websiteUrl"
                    placeholder="Paste the homepage URL"
                    value={websiteUrl}
                    onChange={handleWebsiteUrlChange}
                    disabled={isLoading}
                    required
                  />
                </label>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label htmlFor="keywords">
                  Keywords (One per line):
                  <textarea
                    rows={5}
                    id="keywords"
                    placeholder="Keyword 1&#10;Keyword 2&#10;Keyword 3&#10;..."
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    disabled={isLoading}
                  />
                </label>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label>
                  Upload CSV:
                  <div 
                    className={`upload-container ${isFileUploaded ? 'active' : ''}`} 
                    onClick={() => {
                      if (!isLoading) {
                        resetFileInput();
                        fileInputRef.current.click();
                      }
                    }}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      accept=".csv" 
                      onChange={handleFileChange} 
                      style={{ display: 'none' }} 
                      multiple={false}
                      disabled={isLoading}
                    />
                    <FaFileUpload className={`upload-icon ${isFileUploaded ? 'active' : ''}`} />
                    <p className="upload-text">
                      {isFileUploaded ? fileName : 'Click here to choose a file'}
                    </p>
                    <p className="upload-text-small">CSV formats, up to 50MB</p>
                  </div>
                </label>
              </div>
              <button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <FaSpinner className="spinner" style={{ marginRight: '5px' }} />
                    Calculating...
                  </>
                ) : (
                  <>
                    Submit <FaPaperPlane style={{ marginLeft: '5px' }} />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

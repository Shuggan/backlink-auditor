import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import { FaFileUpload, FaPaperPlane, FaClipboard, FaArrowLeft, FaSpinner } from 'react-icons/fa';

function App() {
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
  const keywordList = keywords.split('\n').map(keyword => keyword.trim()).filter(Boolean);
  
  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
        // Check if the file is different from the current one
        if (file.name !== fileName) {
            setCsvFile(file);
            setFileName(file.name);
            setIsFileUploaded(true);
        }
    }
  };

  const resetFileInput = () => {
    setCsvFile(null);
    setFileName('');
    setIsFileUploaded(false);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!csvFile) {
      alert("Please upload a CSV file.");
      return;
    }

    setIsLoading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      setTimeout(() => {
        const results = countAnchors(text);
        setResults(results);
        setShowResults(true);
        setIsLoading(false);
      }, 0);
    };
    reader.readAsText(csvFile);
  };

  const calculateLevenshteinDistance = (phrase1, phrase2) => {
    var distance = [];
    for (var i = 0; i <= phrase1.length; i++) {
      distance[i] = [];
      distance[i][0] = i;
    }
    for (var j = 0; j <= phrase2.length; j++) {
      distance[0][j] = j;
    }
    for (var i = 1; i <= phrase1.length; i++) {
      for (var j = 1; j <= phrase2.length; j++) {
        var cost = (phrase1.charAt(i - 1) === phrase2.charAt(j - 1)) ? 0 : 1;
        distance[i][j] = Math.min(
          distance[i - 1][j] + 1,         // Deletion
          distance[i][j - 1] + 1,         // Insertion
          distance[i - 1][j - 1] + cost   // Substitution
        );
      }
    }
    return distance[phrase1.length][phrase2.length];
  };

  const similarityToPercentage = (phrase1, phrase2) => {
    var maxLength = Math.max(phrase1.length, phrase2.length);
    var distance = calculateLevenshteinDistance(phrase1, phrase2);
    var percentage = ((maxLength - distance) / maxLength) * 100;
    return percentage.toFixed(2);
  };

  const countAnchors = (csvText) => {
    const rows = csvText.split('\n').slice(1); // Skip header row
    let totalAnchors = 0;
    let brandedAnchors = 0;
    let nakedUrlAnchors = 0;
    let exactMatch = 0;
    let partialMatch = 0;
    let generic = 0;
    let miscellaneous = 0;
    let emptyAnchors = 0;

    rows.forEach(row => {
      const columns = row.split(',');
      const anchor = columns[3]?.trim(); // Column D
      totalAnchors += 1;
      if (anchor) {
        if (anchor.toLowerCase().includes(companyName.toLowerCase()) && !isUrl(anchor)) {
          brandedAnchors += 1;
        } else if (isUrl(anchor)) {
          nakedUrlAnchors += 1;
        } else if (isMiscellaneous(anchor)) {
          miscellaneous += 1;
        } else {
          // Optimize exact match check
          let isExactMatch = false;
          for (const keyword of keywordList) {
            const similarity = similarityToPercentage(anchor.toLowerCase(), keyword.toLowerCase());
            if (similarity >= 90) {
              exactMatch += 1;
              isExactMatch = true;
              break; // Early exit on first match
            }
          }
          if (!isExactMatch) {
            // Optimize partial match check
            for (const keyword of keywordList) {
              const similarity = similarityToPercentage(anchor.toLowerCase(), keyword.toLowerCase());
              if (similarity >= 60) {
                partialMatch += 1;
                break; // Early exit on first match
              }
            }
            if (!isExactMatch) {
              generic += 1;
            }
          }
        }
      } else {
        emptyAnchors += 1;
      }
    });

    return {
      totalAnchors,
      brandedAnchors,
      nakedUrlAnchors,
      exactMatch,
      partialMatch,
      generic,
      miscellaneous,
      emptyAnchors,
    };
  };

  const isUrl = (anchor) => {
    return anchor.includes(websiteUrl);
  };

  const isMiscellaneous = (anchor) => {
    return /[^\x00-\x7F]+/.test(anchor);
  };

  const handleCopyResults = () => {
    const resultsText = `
${results.brandedAnchors}
${results.nakedUrlAnchors}
${results.exactMatch}
${results.partialMatch}
${results.emptyAnchors}

${results.generic}
${results.miscellaneous}
    `;
    navigator.clipboard.writeText(resultsText.trim()).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
        console.error("Failed to copy: ", err);
    });
  };

  const handleGoBack = () => {
    setShowResults(false);
    setResults(null);
  };

  const normalizeUrl = (url) => {
    // Remove protocol (http, https)
    url = url.replace(/(^\w+:|^)\/\//, '');
    // Remove www
    url = url.replace(/^www\./, '');
    // Remove any slugs or paths
    url = url.split('/')[0];
    return url;
  };

  const handleWebsiteUrlChange = (e) => {
    const normalizedUrl = normalizeUrl(e.target.value);
    setWebsiteUrl(normalizedUrl);
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
                <button onClick={handleCopyResults}>
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
                  />
                </label>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label>
                  Upload CSV:
                  <div 
                    className={`upload-container ${isFileUploaded ? 'active' : ''}`} 
                    onClick={() => {
                      resetFileInput();
                      fileInputRef.current.click();
                    }}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      accept=".csv" 
                      onChange={handleFileChange} 
                      style={{ display: 'none' }} 
                      multiple={false}
                      disabled={isFileUploaded}
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
                    <FaSpinner className="spinner" style={{ marginRight: '5px', animation: 'spin 1s linear infinite' }} />
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

import React from 'react';

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Lora:ital,wght@0,400;0,500;0,600;0,700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Lora', Georgia, serif;
    background: #f4f2ee;
    color: #2c2c2c;
    min-height: 100vh;
  }

  .home-header {
    background: #1a3a2a;
    color: white;
    padding: 2rem 1.5rem;
    text-align: center;
  }

  .home-header h1 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.75rem;
    font-weight: 700;
    color: white;
    letter-spacing: 0.04em;
  }

  .home-header .tagline {
    color: #b4a064;
    font-size: 0.9rem;
    letter-spacing: 0.12em;
    margin-top: 0.4rem;
  }

  .home-main {
    max-width: 700px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  .home-intro {
    text-align: center;
    margin-bottom: 2rem;
    color: #6b7280;
    font-size: 1rem;
    line-height: 1.7;
  }

  .tools-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.25rem;
    margin-bottom: 2.5rem;
  }

  .tool-card {
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    padding: 1.75rem 1.5rem;
    text-decoration: none;
    color: inherit;
    display: block;
    transition: box-shadow 0.15s, transform 0.15s;
    border: 1px solid rgba(0,0,0,0.06);
  }

  .tool-card:hover {
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    transform: translateY(-2px);
    text-decoration: none;
  }

  .tool-card-icon {
    font-size: 2rem;
    margin-bottom: 0.75rem;
  }

  .tool-card h2 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.05rem;
    font-weight: 600;
    color: #1a3a2a;
    margin-bottom: 0.5rem;
  }

  .tool-card p {
    color: #6b7280;
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .tool-card.primary {
    border-left: 4px solid #1e2d4a;
  }

  .tool-card.secondary {
    border-left: 4px solid #b4a064;
  }

  .tool-badge {
    display: inline-block;
    background: #1e2d4a;
    color: white;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    margin-top: 0.75rem;
    text-transform: uppercase;
  }

  .home-footer {
    text-align: center;
    padding: 1.5rem;
    color: #6b7280;
    font-size: 0.8rem;
    border-top: 1px solid rgba(0,0,0,0.08);
  }
`;

export default function App() {
  return (
    <>
      <style>{styles}</style>
      <div className="home-header">
        <h1>Iron &amp; Light Johnson Academy</h1>
        <div className="tagline">Faith · Knowledge · Strength</div>
      </div>

      <main className="home-main">
        <p className="home-intro">
          Welcome to the Iron &amp; Light Johnson Academy resource hub.
          Select a tool below to get started.
        </p>

        <div className="tools-grid">
          <a href="/planner" className="tool-card primary">
            <div className="tool-card-icon">📋</div>
            <h2>Daily Planner</h2>
            <p>
              Schedule lessons, log daily progress, track ND compliance,
              and manage the full homeschool record for Orion and Malachi.
            </p>
            <span className="tool-badge">Open Planner →</span>
          </a>

          <a href="/te-extractor/" className="tool-card secondary">
            <div className="tool-card-icon">📄</div>
            <h2>TE Question Extractor</h2>
            <p>
              Upload Teacher Edition PDFs and extract all lesson questions
              and vocabulary into a formatted HTML document.
            </p>
            <span className="tool-badge" style={{background:'#b4a064'}}>Open Tool →</span>
          </a>
        </div>
      </main>

      <footer className="home-footer">
        Iron &amp; Light Johnson Academy · Faith · Knowledge · Strength
      </footer>
    </>
  );
}

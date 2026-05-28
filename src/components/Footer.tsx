import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand-block">
          <p className="footer-brand">⏱ TIMECUT</p>
          <p className="footer-tagline">Know the value before you spend your time.</p>
        </div>
        <div className="footer-links-grid">
          <div>
            <p className="footer-col-title">Product</p>
            <ul className="footer-col-links">
              <li><Link to="/how-it-works">How it Works</Link></li>
              <li><Link to="/features">Features</Link></li>
              <li><Link to="/examples">Examples</Link></li>
              <li><Link to="/pricing">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <p className="footer-col-title">Company</p>
            <ul className="footer-col-links">
              <li><Link to="/blog">Blog</Link></li>
              <li><a href="#">About</a></li>
              <li><a href="#">Privacy</a></li>
              <li><a href="#">Terms</a></li>
            </ul>
          </div>
          <div>
            <p className="footer-col-title">Account</p>
            <ul className="footer-col-links">
              <li><Link to="/login">Log in</Link></li>
              <li><Link to="/get-started">Get Started</Link></li>
            </ul>
          </div>
          <div>
            <p className="footer-col-title">Contact</p>
            <ul className="footer-col-links">
              <li><Link to="/contact">Send a Message</Link></li>
              <li><Link to="/contact">Feature Request</Link></li>
              <li><Link to="/contact">Leave Feedback</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="footer-bottom container">
        <p>© {new Date().getFullYear()} TimeCut. All rights reserved.</p>
      </div>
    </footer>
  )
}

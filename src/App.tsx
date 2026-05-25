import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import Navbar from './components/Navbar'
import ScrollToTop from './components/ScrollToTop'
import HomePage from './pages/HomePage'
import HowItWorksPage from './pages/HowItWorksPage'
import FeaturesPage from './pages/FeaturesPage'
import ExamplesPage from './pages/ExamplesPage'
import PricingPage from './pages/PricingPage'
import BlogPage from './pages/BlogPage'
import LoginPage from './pages/LoginPage'
import GetStartedPage from './pages/GetStartedPage'

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/examples" element={<ExamplesPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/get-started" element={<GetStartedPage />} />
      </Routes>
    </BrowserRouter>
  )
}

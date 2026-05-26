import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import Navbar from './components/Navbar'
import ScrollToTop from './components/ScrollToTop'
import { AuthProvider } from './contexts/AuthContext'
import { AuthModalProvider } from './contexts/AuthModalContext'
import AuthModal from './components/AuthModal'

const HomePage = lazy(() => import('./pages/HomePage'))
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage'))
const FeaturesPage = lazy(() => import('./pages/FeaturesPage'))
const ExamplesPage = lazy(() => import('./pages/ExamplesPage'))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const BlogPage = lazy(() => import('./pages/BlogPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const GetStartedPage = lazy(() => import('./pages/GetStartedPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthModalProvider>
          <ScrollToTop />
          <Navbar />
          <Suspense fallback={<div className="page-loading" />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/how-it-works" element={<HowItWorksPage />} />
              <Route path="/features" element={<FeaturesPage />} />
              <Route path="/examples" element={<ExamplesPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/blog" element={<BlogPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/get-started" element={<GetStartedPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Routes>
          </Suspense>
          <AuthModal />
        </AuthModalProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

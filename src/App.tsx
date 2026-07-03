import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import Navbar from './components/Navbar'
import ScrollToTop from './components/ScrollToTop'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AuthModalProvider } from './contexts/AuthModalContext'
import AuthModal from './components/AuthModal'
import { isAdminEmail } from './lib/admin'

const HomePage = lazy(() => import('./pages/HomePage'))
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage'))
const FeaturesPage = lazy(() => import('./pages/FeaturesPage'))
const ExamplesPage = lazy(() => import('./pages/ExamplesPage'))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const BlogPage = lazy(() => import('./pages/BlogPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const GetStartedPage = lazy(() => import('./pages/GetStartedPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))
const TermsPage   = lazy(() => import('./pages/TermsPage'))
const AboutPage   = lazy(() => import('./pages/AboutPage'))
const AdminPage   = lazy(() => import('./pages/AdminPage'))

// Admins land on /admin only — keep them off the regular user dashboard
// (e.g. if they hit the back button or open a bookmarked "/" link).
function AdminRouteGuard() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user?.email || location.pathname === '/admin') return
    let active = true
    isAdminEmail(user.email).then(ok => {
      if (active && ok && location.pathname === '/') {
        navigate('/admin', { replace: true })
      }
    })
    return () => { active = false }
  }, [user, location.pathname, navigate])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthModalProvider>
          <ScrollToTop />
          <AdminRouteGuard />
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
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms"   element={<TermsPage />} />
              <Route path="/about"   element={<AboutPage />} />
              <Route path="/admin"   element={<AdminPage />} />
            </Routes>
          </Suspense>
          <AuthModal />
        </AuthModalProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

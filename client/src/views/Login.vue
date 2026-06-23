<template>
  <div class="auth-page">
    <div class="auth-card card">
      <h1 class="auth-title">Login</h1>
      <p class="auth-subtitle">Welcome back to Gamer Beta</p>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input v-model="form.email" type="email" class="form-input" placeholder="you@example.com" required />
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input v-model="form.password" type="password" class="form-input" placeholder="Enter your password" required />
        </div>
        <p v-if="error" class="form-error">{{ error }}</p>
        <button type="submit" class="btn btn-primary btn-block btn-lg" :disabled="loading">
          {{ loading ? 'Logging in...' : 'Login' }}
        </button>
      </form>
      <div class="auth-divider"><span>or</span></div>
      <a :href="githubAuthUrl" class="btn btn-github btn-block btn-lg">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
        Login with GitHub
      </a>
      <p class="auth-footer">
        Don't have an account? <router-link to="/register">Register</router-link>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const form = reactive({ email: '', password: '' })
const error = ref('')
const loading = ref(false)
const githubAuthUrl = '/api/auth/github'

onMounted(() => {
  const token = route.query.token
  const err = route.query.error
  if (token) {
    localStorage.setItem('token', token)
    auth.token = token
    auth.fetchUser().then(() => router.replace('/'))
  } else if (err) {
    error.value = err === 'github_failed' ? 'GitHub login failed. Please try again.' : 'Login error'
    router.replace({ query: {} })
  }
})

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(form.email, form.password)
    router.push('/')
  } catch (e) {
    error.value = e.response?.data?.error || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 160px);
}

.auth-card {
  width: 100%;
  max-width: 440px;
  padding: 40px;
}

.auth-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
}

.auth-subtitle {
  color: var(--text-muted);
  margin-bottom: 32px;
  font-size: 15px;
}

.auth-footer {
  margin-top: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

.auth-footer a {
  color: var(--primary);
  font-weight: 500;
}

.auth-divider {
  display: flex; align-items: center; margin: 20px 0; color: var(--text-muted); font-size: 13px;
}
.auth-divider::before, .auth-divider::after {
  content: ''; flex: 1; height: 1px; background: var(--border);
}
.auth-divider span { padding: 0 12px; }

.btn-github {
  background: #24292e; border: 1px solid #444; color: #fff; display: flex; align-items: center; justify-content: center; gap: 10px; text-decoration: none;
}
.btn-github:hover { background: #2f363d; }
</style>

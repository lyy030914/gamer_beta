<template>
  <div id="app-root">
    <nav class="navbar">
      <div class="nav-inner">
        <router-link to="/" class="logo">Gamer Beta</router-link>
        <div class="nav-links">
          <router-link to="/create" class="nav-btn create-btn">+ Create</router-link>
          <router-link v-if="auth.isLoggedIn" to="/assets" class="nav-btn">Materials</router-link>
          <template v-if="auth.isLoggedIn">
            <span class="nav-user">{{ auth.user?.nickname }}</span>
            <button @click="handleLogout" class="nav-btn">Logout</button>
          </template>
          <template v-else>
            <router-link to="/login" class="nav-btn">Login</router-link>
            <router-link to="/register" class="nav-btn primary">Register</router-link>
          </template>
        </div>
      </div>
    </nav>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const router = useRouter()

onMounted(() => {
  auth.fetchUser()
})

function handleLogout() {
  auth.logout()
  router.push('/')
}
</script>

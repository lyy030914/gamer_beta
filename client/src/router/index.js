import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue')
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue')
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/Register.vue')
  },
  {
    path: '/game/:id',
    name: 'GameDetail',
    component: () => import('../views/GameDetail.vue')
  },
  {
    path: '/play/:id',
    name: 'GamePlay',
    component: () => import('../views/GamePlay.vue')
  },
  {
    path: '/create',
    name: 'Create',
    component: () => import('../views/Create.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/assets',
    name: 'Assets',
    component: () => import('../views/Assets.vue'),
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router

import axios from 'axios';

// Intercept every response. If the server rejects the request because
// the JWT is missing or expired (401 / 403 from the auth middleware),
// clear the stale session and send the user back to login.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    // Only redirect when the error comes from the auth middleware,
    // not from route-level 403s (wrong role) which have their own handling.
    const authMsg = error?.response?.data?.message || '';
    const isAuthFailure =
      status === 401 ||
      (status === 403 && authMsg.toLowerCase().includes('token'));

    if (isAuthFailure) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('userRole');
      localStorage.removeItem('userName');
      localStorage.removeItem('userId');
      // Avoid an infinite redirect if we're already on the login page.
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

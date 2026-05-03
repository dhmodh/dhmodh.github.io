// Theme Toggle
const themeToggle = document.getElementById('themeToggle');
const savedTheme = localStorage.getItem('theme') || 'dark';

// Set initial theme
document.documentElement.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);

themeToggle?.addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
});

function updateThemeIcon(theme) {
  if (themeToggle) {
    themeToggle.querySelector('.theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

// Mobile Menu Toggle
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const navMenu = document.querySelector('.nav-menu');

mobileMenuToggle?.addEventListener('click', () => {
  navMenu?.classList.toggle('active');
  mobileMenuToggle.classList.toggle('active');
});

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    navMenu?.classList.remove('active');
    mobileMenuToggle?.classList.remove('active');
  });
});

// Reveal on Scroll Animation
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('active');
    }
  });
}, {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
});

document.querySelectorAll('.reveal').forEach(el => {
  revealObserver.observe(el);
});

// Service Cards Animation
const serviceCards = document.querySelectorAll('.service-card');
serviceCards.forEach((card, index) => {
  card.style.opacity = '0';
  card.style.transform = 'translateY(30px)';
  
  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }, index * 100);
        cardObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });
  
  cardObserver.observe(card);
});

// Smooth Scroll for Anchor Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      const offsetTop = target.offsetTop - 80;
      window.scrollTo({
        top: offsetTop,
        behavior: 'smooth'
      });
    }
  });
});

// Navbar Scroll Effect
let lastScroll = 0;
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;
  
  if (currentScroll > 100) {
    navbar?.classList.add('scrolled');
  } else {
    navbar?.classList.remove('scrolled');
  }
  
  lastScroll = currentScroll;
});

// Parallax Effect for Hero Section
window.addEventListener('scroll', () => {
  const scrolled = window.pageYOffset;
  const heroVisual = document.querySelector('.hero-visual');
  
  if (heroVisual && scrolled < window.innerHeight) {
    heroVisual.style.transform = `translateY(${scrolled * 0.3}px)`;
    heroVisual.style.opacity = 1 - (scrolled / window.innerHeight) * 0.5;
  }
});

// Floating Cards Animation Enhancement
const floatingCards = document.querySelectorAll('.floating-card');
floatingCards.forEach((card, index) => {
  card.addEventListener('mouseenter', () => {
    card.style.transform = 'translateY(-10px) scale(1.05)';
    card.style.transition = 'transform 0.3s ease';
  });
  
  card.addEventListener('mouseleave', () => {
    card.style.transform = 'translateY(0) scale(1)';
  });
});

// Form Validation and Enhancement
const contactForm = document.querySelector('.contact-form');
if (contactForm) {
  const inputs = contactForm.querySelectorAll('input, textarea');
  
  inputs.forEach(input => {
    input.addEventListener('focus', () => {
      input.parentElement?.classList.add('focused');
    });
    
    input.addEventListener('blur', () => {
      if (!input.value) {
        input.parentElement?.classList.remove('focused');
      }
    });
  });
  
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Add loading state
    const submitButton = contactForm.querySelector('button[type="submit"]');
    const originalText = submitButton?.textContent;
    
    if (submitButton) {
      submitButton.textContent = 'Sending...';
      submitButton.disabled = true;
    }
    
    // Simulate form submission (replace with actual form handling)
    setTimeout(() => {
      if (submitButton) {
        submitButton.textContent = 'Sent! ✓';
        submitButton.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        
        setTimeout(() => {
          if (submitButton) {
            submitButton.textContent = originalText;
            submitButton.disabled = false;
            submitButton.style.background = '';
            contactForm.reset();
          }
        }, 2000);
      }
    }, 1500);
  });
}

// Cursor Effect (Optional - can be removed if not needed)
let cursor = null;
let cursorFollower = null;

function createCursor() {
  cursor = document.createElement('div');
  cursor.className = 'custom-cursor';
  cursor.style.cssText = `
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent-primary);
    position: fixed;
    pointer-events: none;
    z-index: 9999;
    transition: transform 0.1s ease;
    display: none;
  `;
  
  cursorFollower = document.createElement('div');
  cursorFollower.className = 'cursor-follower';
  cursorFollower.style.cssText = `
    width: 30px;
    height: 30px;
    border: 2px solid var(--accent-primary);
    border-radius: 50%;
    position: fixed;
    pointer-events: none;
    z-index: 9998;
    opacity: 0.5;
    transition: transform 0.15s ease;
    display: none;
  `;
  
  document.body.appendChild(cursor);
  document.body.appendChild(cursorFollower);
  
  document.addEventListener('mousemove', (e) => {
    if (cursor && cursorFollower) {
      cursor.style.left = e.clientX - 5 + 'px';
      cursor.style.top = e.clientY - 5 + 'px';
      
      setTimeout(() => {
        if (cursorFollower) {
          cursorFollower.style.left = e.clientX - 15 + 'px';
          cursorFollower.style.top = e.clientY - 15 + 'px';
        }
      }, 50);
    }
  });
  
  // Show cursor on desktop only
  if (window.innerWidth > 768) {
    cursor.style.display = 'block';
    cursorFollower.style.display = 'block';
  }
}

// Initialize cursor effect (comment out if not needed)
// createCursor();

// Performance Optimization: Debounce scroll events
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Apply debounce to scroll handlers
const debouncedScroll = debounce(() => {
  // Scroll-based animations can be added here
}, 10);

window.addEventListener('scroll', debouncedScroll);

// Add active state to navigation links based on current page
const currentPage = window.location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav-link').forEach(link => {
  const linkHref = link.getAttribute('href');
  if (linkHref === currentPage || (currentPage === '' && linkHref === 'index.html')) {
    link.classList.add('active');
  }
});

// Scroll Progress + Back To Top
const scrollProgress = document.createElement('div');
scrollProgress.className = 'scroll-progress';
document.body.appendChild(scrollProgress);

const backToTop = document.createElement('button');
backToTop.className = 'back-to-top';
backToTop.setAttribute('aria-label', 'Back to top');
backToTop.textContent = '↑';
document.body.appendChild(backToTop);

const updateScrollUi = () => {
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
  scrollProgress.style.width = `${progress}%`;

  if (window.scrollY > 350) {
    backToTop.classList.add('visible');
  } else {
    backToTop.classList.remove('visible');
  }
};

window.addEventListener('scroll', updateScrollUi, { passive: true });
window.addEventListener('resize', updateScrollUi);
updateScrollUi();

backToTop.addEventListener('click', () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
});

// Homepage counter animation
const statNumbers = document.querySelectorAll('.stat-number[data-target]');
if (statNumbers.length > 0) {
  const counterObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      const el = entry.target;
      const target = Number(el.getAttribute('data-target')) || 0;
      const divisor = Number(el.getAttribute('data-divisor')) || 1;
      const prefix = el.getAttribute('data-prefix') || '';
      const suffix = el.getAttribute('data-suffix') || '+';
      const duration = 1200;
      const startTime = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - startTime) / duration, 1);
        const current = Math.floor(progress * target);
        const value = current / divisor;
        const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2);
        el.textContent = `${prefix}${formatted}${suffix}`;
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          const finalValue = target / divisor;
          const finalFormatted = Number.isInteger(finalValue) ? String(finalValue) : finalValue.toFixed(2);
          el.textContent = `${prefix}${finalFormatted}${suffix}`;
        }
      };

      requestAnimationFrame(tick);
      observer.unobserve(el);
    });
  }, { threshold: 0.4 });

  statNumbers.forEach(num => counterObserver.observe(num));
}

// Projects filter feature
const projectFilterButtons = document.querySelectorAll('.project-filter-btn');
const projectCards = document.querySelectorAll('.project-card[data-category]');
if (projectFilterButtons.length > 0 && projectCards.length > 0) {
  projectFilterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-filter') || 'all';
      projectFilterButtons.forEach(item => item.classList.remove('active'));
      btn.classList.add('active');

      projectCards.forEach(card => {
        const categories = (card.getAttribute('data-category') || '').split(' ');
        const show = filter === 'all' || categories.includes(filter);
        card.style.display = show ? '' : 'none';
      });
    });
  });
}

// Blog filter feature
const blogFilterButtons = document.querySelectorAll('.blog-filter-btn');
const blogCards = document.querySelectorAll('.blog-card[data-blog-category]');
if (blogFilterButtons.length > 0 && blogCards.length > 0) {
  blogFilterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-blog-filter') || 'all';
      blogFilterButtons.forEach(item => item.classList.remove('active'));
      btn.classList.add('active');

      blogCards.forEach(card => {
        const categories = (card.getAttribute('data-blog-category') || '').split(' ');
        const show = filter === 'all' || categories.includes(filter);
        card.style.display = show ? '' : 'none';
      });
    });
  });
}

// Copy to clipboard buttons (contact page)
document.querySelectorAll('.copy-btn[data-copy]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const text = btn.getAttribute('data-copy');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 1200);
    } catch (error) {
      btn.textContent = 'Failed';
      setTimeout(() => {
        btn.textContent = 'Copy';
      }, 1200);
    }
  });
});

// Console Easter Egg
console.log('%c👋 Hey there!', 'font-size: 20px; font-weight: bold; color: #3b82f6;');
console.log('%cInterested in the code? Check out the repository!', 'font-size: 14px; color: #94a3b8;');

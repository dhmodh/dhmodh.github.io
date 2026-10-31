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
  
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = contactForm.querySelector('button[type="submit"]');
    const label = submitButton?.querySelector('span');
    const original = label?.textContent;
    let status = contactForm.querySelector('.form-status');
    if (!status) {
      status = document.createElement('p');
      status.className = 'form-status';
      status.setAttribute('role', 'status');
      contactForm.appendChild(status);
    }
    if (submitButton) { submitButton.disabled = true; if (label) label.textContent = 'Sending...'; }
    status.className = 'form-status';
    status.textContent = '';
    try {
      const res = await fetch(contactForm.action, {
        method: 'POST',
        body: new FormData(contactForm),
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) throw new Error('Request failed');
      status.textContent = 'Thanks! Your message was sent. I will get back to you soon.';
      status.classList.add('ok');
      contactForm.reset();
    } catch (err) {
      status.textContent = 'Sorry, something went wrong. Please email me directly at dishantmodh7@gmail.com.';
      status.classList.add('error');
    } finally {
      if (submitButton) { submitButton.disabled = false; if (label) label.textContent = original; }
    }
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
        const formatted = String(parseFloat(value.toFixed(2)));
        el.textContent = `${prefix}${formatted}${suffix}`;
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          const finalValue = target / divisor;
          const finalFormatted = String(parseFloat(finalValue.toFixed(2)));
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

// Blog filter + search
const blogFilterButtons = document.querySelectorAll('.blog-filter-btn');
const blogCards = document.querySelectorAll('.blog-card[data-blog-category]');
if (blogCards.length > 0) {
  const searchInput = document.getElementById('blogSearch');
  const countEl = document.getElementById('blogCount');
  let activeFilter = 'all';
  const applyBlogFilters = () => {
    const q = (searchInput?.value || '').trim().toLowerCase();
    let shown = 0;
    blogCards.forEach(card => {
      const categories = (card.getAttribute('data-blog-category') || '').split(' ');
      const okFilter = activeFilter === 'all' || categories.includes(activeFilter);
      const okSearch = !q || card.textContent.toLowerCase().includes(q);
      const show = okFilter && okSearch;
      card.style.display = show ? '' : 'none';
      if (show) shown++;
    });
    if (countEl) countEl.textContent = (q || activeFilter !== 'all')
      ? (shown ? shown + ' article' + (shown === 1 ? '' : 's') + ' found' : 'No articles match. Try another keyword.') : '';
  };
  blogFilterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.getAttribute('data-blog-filter') || 'all';
      blogFilterButtons.forEach(item => item.classList.remove('active'));
      btn.classList.add('active');
      applyBlogFilters();
    });
  });
  searchInput?.addEventListener('input', applyBlogFilters);
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

// ===== 2026 Refresh: typing effect =====
(() => {
  const el = document.getElementById('typed');
  if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const tmp = document.createElement('textarea');
  const words = el.dataset.words.split('|').map(w => { tmp.innerHTML = w; return tmp.value; });
  let w = 0, c = words[0].length, deleting = true;
  const step = () => {
    const word = words[w];
    el.textContent = word.slice(0, c);
    if (deleting) { c--; if (c < 0) { deleting = false; w = (w + 1) % words.length; c = 0; } }
    else { c++; if (c > words[w].length) { deleting = true; c = words[w].length; setTimeout(step, 1600); return; } }
    setTimeout(step, deleting ? 35 : 70);
  };
  setTimeout(step, 3200);
})();

// ===== Cursor spotlight =====
(() => {
  if (window.matchMedia('(hover: none)').matches) return;
  const s = document.createElement('div');
  s.className = 'spotlight';
  document.body.appendChild(s);
  window.addEventListener('mousemove', e => {
    s.style.left = e.clientX + 'px';
    s.style.top = e.clientY + 'px';
    s.style.opacity = 1;
  }, { passive: true });
})();

// ===== Subtle 3D tilt on cards =====
(() => {
  if (window.matchMedia('(hover: none)').matches) return;
  document.querySelectorAll('.service-card, .cert-card, .why-hire-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      card.style.transform = `perspective(700px) rotateX(${-y * 6}deg) rotateY(${x * 6}deg) translateY(-4px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
})();

// ===== Command palette (Ctrl/Cmd+K or "/") =====
(() => {
  const items = [
    { t: 'Home', h: '/index.html', k: 'go' },
    { t: 'About', h: '/about.html', k: 'go' },
    { t: 'Experience', h: '/experience.html', k: 'go' },
    { t: 'Projects', h: '/projects.html', k: 'go' },
    { t: 'Reliability Tools', h: '/tools.html', k: 'go' },
    { t: 'Failover Simulator', h: '/tools.html#failover', k: 'play' },
    { t: 'Blog', h: '/blog.html', k: 'go' },
    { t: 'Contact', h: '/contact.html', k: 'go' },
    { t: 'All Games', h: '/games.html', k: 'play' },
    { t: 'DB Word Guess (daily)', h: '/word-game.html', k: 'play' },
    { t: 'Vacuum Snake', h: '/snake-game.html', k: 'play' },
    { t: 'SQL Sprint (typing)', h: '/typing-game.html', k: 'play' },
    { t: 'Quiz Game', h: '/game.html', k: 'play' },
    { t: 'Memory Match', h: '/memory-game.html', k: 'play' },
    { t: 'Incident Challenge', h: '/incident-game.html', k: 'play' },
    { t: 'Resume (web)', h: '/resume.html', k: 'go' },
    { t: 'Download Resume (PDF)', h: '/resume.pdf', k: 'open', ext: true },
    { t: 'Article: PostgreSQL p95 latency playbook', h: '/blog/postgresql-p95-latency-playbook.html', k: 'read' },
    { t: 'Article: Zero-downtime DB migrations', h: '/blog/zero-downtime-database-migration-aws-dms-pglogical.html', k: 'read' },
    { t: 'Article: Aurora Global Database DR', h: '/blog/aurora-global-database-dr-readiness.html', k: 'read' },
    { t: 'Article: MongoDB aggregation tuning', h: '/blog/mongodb-aggregation-pipeline-tuning.html', k: 'read' },
    { t: 'Article: Datadog + Grafana alerting', h: '/blog/datadog-grafana-alerting-reduce-mttr.html', k: 'read' },
    { t: 'Article: PostgreSQL on-call playbook', h: '/blog/postgresql-on-call-playbook-p1-incidents.html', k: 'read' },
    { t: 'Article: PgBouncer guide', h: '/blog/pgbouncer-connection-pooling-guide.html', k: 'read' },
    { t: 'Article: Terraform RDS modules', h: '/blog/terraform-rds-module-patterns.html', k: 'read' },
    { t: 'LinkedIn', h: 'https://linkedin.com/in/dishantmodh', k: 'open', ext: true },
    { t: 'GitHub', h: 'https://github.com/dhmodh', k: 'open', ext: true },
    { t: 'Copy email address', k: 'action', run: () => navigator.clipboard?.writeText('dishantmodh7@gmail.com') },
    { t: 'Toggle light / dark theme', k: 'action', run: () => document.getElementById('themeToggle')?.click() }
  ];
  let overlay, input, list, sel = 0, shown = [], lastFocus;

  const build = () => {
    overlay = document.createElement('div');
    overlay.className = 'cmdk-overlay';
    overlay.hidden = true;
    overlay.innerHTML = '<div class="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">' +
      '<input class="cmdk-input" type="text" placeholder="Jump to a page or action..." aria-label="Search commands" autocomplete="off">' +
      '<ul class="cmdk-list" role="listbox"></ul>' +
      '<div class="cmdk-foot"><span>↑↓ navigate</span><span>↵ select</span><span>esc close</span></div></div>';
    document.body.appendChild(overlay);
    input = overlay.querySelector('.cmdk-input');
    list = overlay.querySelector('.cmdk-list');
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(shown[sel]); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
  };
  const render = (q) => {
    q = (q || '').trim().toLowerCase();
    shown = items.filter(i => !q || i.t.toLowerCase().includes(q) || i.k.includes(q));
    sel = 0;
    list.innerHTML = shown.length
      ? shown.map((i, n) => `<li role="option" data-n="${n}"><span>${i.t}</span><em>${i.k}</em></li>`).join('')
      : '<li class="cmdk-empty">No results</li>';
    list.querySelectorAll('li[data-n]').forEach(li => {
      li.addEventListener('mousemove', () => { sel = +li.dataset.n; paint(); });
      li.addEventListener('click', () => choose(shown[+li.dataset.n]));
    });
    paint();
  };
  const paint = () => {
    list.querySelectorAll('li[data-n]').forEach(li => {
      const on = +li.dataset.n === sel;
      li.classList.toggle('sel', on);
      li.setAttribute('aria-selected', on);
      if (on) li.scrollIntoView({ block: 'nearest' });
    });
  };
  const choose = (i) => {
    if (!i) return;
    close();
    if (i.run) i.run();
    else if (i.ext) window.open(i.h, '_blank', 'noopener');
    else window.location.href = i.h;
  };
  const open = () => {
    if (!overlay) build();
    lastFocus = document.activeElement;
    overlay.hidden = false;
    input.value = '';
    render('');
    input.focus();
  };
  const close = () => {
    if (overlay) overlay.hidden = true;
    lastFocus?.focus?.();
  };
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); overlay && !overlay.hidden ? close() : open(); }
    else if (e.key === '/' && !typing) { e.preventDefault(); open(); }
    else if (e.key === 'Escape' && overlay && !overlay.hidden) close();
  });
  // nav button
  const container = document.querySelector('.nav-container');
  const themeBtn = document.getElementById('themeToggle');
  if (container && themeBtn) {
    const b = document.createElement('button');
    b.className = 'cmdk-btn';
    b.type = 'button';
    b.setAttribute('aria-label', 'Open command palette');
    b.innerHTML = '<span>Search</span><kbd>Ctrl K</kbd>';
    b.addEventListener('click', open);
    container.insertBefore(b, themeBtn);
  }
})();

// Resume page: print button
document.getElementById('printResume')?.addEventListener('click', () => window.print());

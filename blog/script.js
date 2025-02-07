const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

// Check for saved theme preference
let currentTheme = localStorage.getItem('theme');

if (currentTheme) {
    body.classList.add(currentTheme);
    if (currentTheme === 'light-mode') {
        themeToggle.textContent = "Dark";
    }
} else {
    // Default to dark mode
    currentTheme = 'dark-mode';
    body.classList.add(currentTheme);
    themeToggle.textContent = "Light";
}

themeToggle.addEventListener('click', () => {
    if (currentTheme === 'dark-mode') {
        body.classList.replace('dark-mode', 'light-mode');
        currentTheme = 'light-mode';
        themeToggle.textContent = "Dark";
    } else {
        body.classList.replace('light-mode', 'dark-mode');
        currentTheme = 'dark-mode';
        themeToggle.textContent = "Light";
    }

    // Save the current theme preference
    localStorage.setItem('theme', currentTheme);
});

// JavaScript for more interactive popups
document.addEventListener('DOMContentLoaded', () => {
    const popupLinks = document.querySelectorAll('.popup-link');

    popupLinks.forEach(link => {
        const popupContent = link.querySelector('.popup-content');
        link.addEventListener('click', (event) => {
            // Check if the click target is a link INSIDE the popup
            if (!event.target.closest('.popup-content')) {
                // If not inside .popup-content, then we toggle the popup
                event.preventDefault(); // Prevent default link behavior ONLY for the outer link
                if (popupContent.style.display === 'block') {
                    popupContent.style.display = 'none';
                } else {
                    popupContent.style.display = 'block';
                    popupContent.style.top = `${link.offsetTop + link.offsetHeight}px`;
                    popupContent.style.left = `${link.offsetLeft}px`;
                }
            }
        });
    });

      // Close popups when clicking outside
      document.addEventListener('click', (event) => {
        if (!event.target.closest('.popup-link')) {
            document.querySelectorAll('.popup-content').forEach(popup => {
                popup.style.display = 'none';
            });
        }
    });
});

// TOC Layout Logic
const sidebarToc = document.getElementById('sidebar-toc');
const inlineToc = document.getElementById('inline-toc');

function adjustLayout() {
    if (window.innerWidth <= 1400) {
        inlineToc.style.display = 'block';
        sidebarToc.style.display = 'none';
    } else {
        inlineToc.style.display = 'none';
        sidebarToc.style.display = 'block';
    }
}

// Call on load and resize
window.addEventListener('load', adjustLayout);
window.addEventListener('resize', adjustLayout);

// Add mailing list div
document.addEventListener("DOMContentLoaded", function () {
    const mailingListHTML = `
        <div class="mailing_list">
            <hr>
            <p><a href="https://groups.google.com/g/neuneuro">Click here to join my email list</a> to get new posts and updates to your inbox.<br>
                (Or send an empty email to <a href="mailto:neuneuro+subscribe@googlegroups.com">neuneuro+subscribe@googlegroups.com</a>.)
            </p>
        </div>
    `;

    // Append it to a specific container
    const targetContainer = document.getElementById("mailingListContainer");
    if (targetContainer) {
        targetContainer.innerHTML = mailingListHTML;
    } else {
        console.error("Target container not found!");
    }
});

// Scrollspy Functionality for Sidebar TOC
document.addEventListener('DOMContentLoaded', () => {
    const sections = document.querySelectorAll('#content h1, #content h2'); 
    const tocLinks = document.querySelectorAll('#sidebar-toc ul li a'); 

    function highlightActiveLink() {
        let currentSectionId = null;
        let viewportHeight = window.innerHeight;
        let scrollY = window.scrollY;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            if (scrollY >= sectionTop - viewportHeight / 3) { 
                currentSectionId = section.getAttribute('id');
            }
        });

        tocLinks.forEach(link => {
            link.classList.remove('active'); 
            if (link.getAttribute('href') === `#${currentSectionId}`) {
                link.classList.add('active');
            }
        });
    }

    if (tocLinks.length > 0 && sections.length > 0) {
        tocLinks[0].classList.add('active'); 
    }

    window.addEventListener('scroll', highlightActiveLink);
    highlightActiveLink(); 
});
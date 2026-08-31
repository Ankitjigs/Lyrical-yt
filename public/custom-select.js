/**
 * Lyrical Custom Select Component
 * Reusable dropdown component with click-outside-to-close functionality
 */

class LyricalSelect {
  constructor(container, options = {}) {
    this.container =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    this.options = options.options || [];
    this.value = options.value || "";
    this.placeholder = options.placeholder || "Select...";
    this.label = options.label || "";
    this.onChange = options.onChange || (() => {});

    this.isOpen = false;
    this.render();
    this.bindEvents();
  }

  render() {
    const selectedOption = this.options.find((opt) => opt.value === this.value);

    this.container.innerHTML = `
      <div class="lyrical-select-wrapper">
        ${
          this.label
            ? `<label class="lyrical-select-label">${this.label}</label>`
            : ""
        }
        <button type="button" class="lyrical-select-trigger">
          <span class="lyrical-select-value ${
            !selectedOption ? "placeholder" : ""
          }">
            ${selectedOption ? selectedOption.label : this.placeholder}
          </span>
          <span class="lyrical-select-arrow">▼</span>
        </button>
        <div class="lyrical-select-dropdown" style="display: none;">
          <div class="lyrical-select-options">
            ${this.options
              .map(
                (opt) => `
              <button type="button" class="lyrical-select-option ${
                opt.value === this.value ? "selected" : ""
              }" data-value="${opt.value}">
                <span>${opt.label}</span>
                ${
                  opt.value === this.value
                    ? '<span class="lyrical-select-check">✓</span>'
                    : ""
                }
              </button>
            `
              )
              .join("")}
          </div>
        </div>
      </div>
    `;

    this.trigger = this.container.querySelector(".lyrical-select-trigger");
    this.dropdown = this.container.querySelector(".lyrical-select-dropdown");
    this.valueDisplay = this.container.querySelector(".lyrical-select-value");
    this.arrow = this.container.querySelector(".lyrical-select-arrow");
  }

  bindEvents() {
    // Toggle dropdown
    this.trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Option selection
    this.container.querySelectorAll(".lyrical-select-option").forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const value = opt.dataset.value;
        this.setValue(value);
        this.close();
      });
    });

    // Click outside to close
    document.addEventListener("click", (e) => {
      if (!this.container.contains(e.target)) {
        this.close();
      }
    });
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    this.isOpen = true;
    this.dropdown.style.display = "block";
    this.arrow.style.transform = "rotate(180deg)";
    this.trigger.classList.add("open");

    // Scroll selected option into view
    const selected = this.dropdown.querySelector(".selected");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }

  close() {
    this.isOpen = false;
    this.dropdown.style.display = "none";
    this.arrow.style.transform = "rotate(0deg)";
    this.trigger.classList.remove("open");
  }

  setValue(value) {
    this.value = value;
    const selectedOption = this.options.find((opt) => opt.value === value);

    // Update display
    this.valueDisplay.textContent = selectedOption
      ? selectedOption.label
      : this.placeholder;
    this.valueDisplay.classList.toggle("placeholder", !selectedOption);

    // Update selected state
    this.container.querySelectorAll(".lyrical-select-option").forEach((opt) => {
      const isSelected = opt.dataset.value === value;
      opt.classList.toggle("selected", isSelected);

      // Update checkmark
      const existingCheck = opt.querySelector(".lyrical-select-check");
      if (isSelected && !existingCheck) {
        opt.insertAdjacentHTML(
          "beforeend",
          '<span class="lyrical-select-check">✓</span>'
        );
      } else if (!isSelected && existingCheck) {
        existingCheck.remove();
      }
    });

    this.onChange(value);
  }

  getValue() {
    return this.value;
  }

  destroy() {
    this.container.innerHTML = "";
  }
}

// Export for usage
window.LyricalSelect = LyricalSelect;

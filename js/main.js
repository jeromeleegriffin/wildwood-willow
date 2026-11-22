// Simple product loader (for first run)
const products = [
  { title: "Arnica Aloe Cream", price: "$24.00", description: "Cooling relief for sore muscles, bruises, and minor skin irritations.", featured: true },
  { title: "Mental Reset", price: "$28.00", description: "Supports focus, clarity, and stress resilience.", featured: true },
  { title: "Nerve Pain Relaxant", price: "$26.00", description: "Herbal support for nerve discomfort and relaxation.", featured: true },
  { title: "Appetite Suppressant", price: "$25.00", description: "Natural support for cravings and mindful eating.", featured: true }
];

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('product-grid');
  products.filter(p => p.featured).forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${p.title}</h3>
      <p>${p.description}</p>
      <p><strong>${p.price}</strong></p>
    `;
    grid.appendChild(card);
  });
});
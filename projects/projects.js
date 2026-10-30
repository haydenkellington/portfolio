import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');

const projectsContainer = document.querySelector('.projects');
const projectsTitle = document.querySelector('.projects-title');
const searchInput = document.querySelector('.searchBar');
const searchStatus = document.querySelector('.search-status');
const emptyState = document.querySelector('.empty-state');
const clearYearFilter = document.querySelector('.clear-year-filter');
const plot = d3.select('#projects-pie-plot');
const legend = d3.select('.legend');
const years = [...new Set(projects.map((project) => project.year))].sort((a, b) => a - b);
const colors = d3.scaleOrdinal(years, d3.schemeTableau10);
const pie = d3.pie().sort(null).value((d) => d.value);
const arc = d3.arc().innerRadius(0).outerRadius(50);
const labelArc = d3.arc().innerRadius(29).outerRadius(29);
let selectedYear = null;

function renderPieChart(projectsGiven) {
  const rolledData = d3.rollups(
    projectsGiven,
    (items) => items.length,
    (project) => project.year,
  ).sort(([yearA], [yearB]) => yearA - yearB);
  const data = rolledData.map(([year, count]) => ({
    value: count,
    label: year,
  }));
  const slices = pie(data);

  plot.select('#projects-pie-description').text(
    projectsGiven.length
      ? `The ${projectsGiven.length} projects matching the current text search are grouped by year: ${data
        .map((d) => `${d.label}, ${d.value}`)
        .join('; ')}.`
      : 'No projects match the current search.',
  );

  plot.selectAll('path')
    .data(slices, (d) => d.data.label)
    .join('path')
    .attr('class', (d) => (d.data.label === selectedYear ? 'slice selected' : 'slice'))
    .attr('d', arc)
    .attr('fill', (d) => colors(d.data.label))
    .attr('stroke', 'white')
    .attr('stroke-width', 0.8)
    .attr('role', 'button')
    .attr('tabindex', 0)
    .attr('aria-pressed', (d) => d.data.label === selectedYear)
    .attr('aria-label', (d) => (
      `${d.data.label}: ${d.data.value} projects. Activate to filter by year; activate again to clear.`
    ))
    .on('click', (event, d) => toggleYear(d.data.label))
    .on('keydown', (event, d) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleYear(d.data.label);
      }
    });

  plot.selectAll('.slice-label')
    .data(slices, (d) => d.data.label)
    .join('text')
    .attr('class', 'slice-label')
    .attr('transform', (d) => `translate(${labelArc.centroid(d)})`)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .text((d) => d.data.label);

  const legendItems = legend.selectAll('li')
    .data(data, (d) => d.label)
    .join(
      (enter) => {
        const items = enter.append('li').attr('class', 'legend-item');
        const buttons = items.append('button')
          .attr('class', 'legend-button')
          .attr('type', 'button');
        buttons.append('span')
          .attr('class', 'swatch')
          .attr('aria-hidden', 'true');
        buttons.append('span').attr('class', 'legend-label');
        buttons.append('em');
        return items;
      },
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr('class', (d) => (
      d.label === selectedYear ? 'legend-item selected' : 'legend-item'
    ))
    .style('--color', (d) => colors(d.label));

  legendItems.select('button')
    .attr('aria-pressed', (d) => d.label === selectedYear)
    .attr('aria-label', (d) => (
      `${d.label}: ${d.value} projects. Activate to filter by year; activate again to clear.`
    ))
    .on('click', (event, d) => toggleYear(d.label));
  legendItems.select('.legend-label').text((d) => d.label);
  legendItems.select('em').text((d) => ` (${d.value})`);
}

function toggleYear(year) {
  selectedYear = selectedYear === year ? null : year;
  renderFilteredProjects(searchInput.value);
}

clearYearFilter.addEventListener('click', () => {
  selectedYear = null;
  renderFilteredProjects(searchInput.value);
});

function renderFilteredProjects(query) {
  const normalizedQuery = query.trim().toLowerCase();
  const searchFilteredProjects = projects.filter((project) => (
    Object.values(project).join('\n').toLowerCase().includes(normalizedQuery)
  ));
  const filteredProjects = selectedYear === null
    ? searchFilteredProjects
    : searchFilteredProjects.filter((project) => project.year === selectedYear);

  renderProjects(filteredProjects, projectsContainer, 'h2');
  projectsTitle.textContent = `Projects (${filteredProjects.length})`;
  emptyState.hidden = filteredProjects.length > 0;
  clearYearFilter.hidden = selectedYear === null;
  emptyState.textContent = selectedYear === null
    ? 'No projects match your search.'
    : `No projects from ${selectedYear} match your search.`;
  if (selectedYear !== null && normalizedQuery) {
    searchStatus.textContent = `${filteredProjects.length} of ${searchFilteredProjects.length} search matches are from ${selectedYear}.`;
  } else if (selectedYear !== null) {
    searchStatus.textContent = `${filteredProjects.length} projects from ${selectedYear}.`;
  } else if (normalizedQuery) {
    searchStatus.textContent = `${filteredProjects.length} of ${projects.length} projects match “${query.trim()}”.`;
  } else {
    searchStatus.textContent = `Showing all ${projects.length} projects.`;
  }
  renderPieChart(searchFilteredProjects);
}

searchInput.addEventListener('input', (event) => {
  renderFilteredProjects(event.currentTarget.value);
});

renderFilteredProjects('');

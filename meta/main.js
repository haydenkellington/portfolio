import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const repo = 'https://github.com/haydenkellington/portfolio';
const tooltip = document.querySelector('#commit-tooltip');
const count = document.querySelector('#selection-count');
const breakdown = document.querySelector('#language-breakdown');
const clearButton = document.querySelector('#clear-selection');
let hideTimer;

function processCommits(lines) {
  // Git uses all-zero IDs for uncommitted changes; they are not actual commits.
  return d3.groups(lines.filter((line) => !/^\^?0+$/.test(line.commit)), (line) => line.commit)
    .map(([id, commitLines]) => {
      const first = commitLines[0];
      const [hours, minutes] = first.time.split(':').map(Number);
      const commit = { id, url: `${repo}/commit/${id.replace(/^\^/, '')}`, author: first.author,
        date: first.date, time: first.time, timezone: first.timezone, datetime: first.datetime,
        hourFrac: hours + minutes / 60, totalLines: commitLines.length };
      Object.defineProperty(commit, 'lines', { value: commitLines, enumerable: false });
      return commit;
    });
}

function renderStats(lines, commits) {
  const files = d3.rollups(lines, (group) => group.length, (line) => line.file);
  const stats = [
    ['Lines of code', d3.format(',')(lines.length)],
    ['Commits represented', d3.format(',')(commits.length)],
    ['Files analyzed', d3.format(',')(files.length)],
    ['Average lines per file', d3.format(',.1f')(d3.mean(files, (file) => file[1]) ?? 0)],
    ['Average line length', `${d3.format(',.1f')(d3.mean(lines, (line) => line.length) ?? 0)} characters`],
    ['Maximum indentation', `${d3.max(lines, (line) => line.depth) ?? 0} levels`],
  ];
  const cards = d3.select('#stats').html('').append('dl').attr('class', 'stats')
    .selectAll('div').data(stats).join('div').attr('class', 'stat');
  cards.append('dt').text((d) => d[0]);
  cards.append('dd').text((d) => d[1]);
}

function showTooltip(event, commit) {
  clearTimeout(hideTimer);
  document.querySelector('#commit-link').href = commit.url;
  document.querySelector('#commit-link').textContent = commit.id.replace(/^\^/, '').slice(0, 8);
  document.querySelector('#commit-date').textContent = commit.date;
  document.querySelector('#commit-time').textContent = `${commit.time} (UTC${commit.timezone})`;
  document.querySelector('#commit-author').textContent = commit.author;
  document.querySelector('#commit-lines').textContent = d3.format(',')(commit.totalLines);
  tooltip.hidden = false;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX || rect.right;
  const y = event.clientY || rect.top;
  tooltip.style.left = `${Math.max(8, Math.min(x + 12, window.innerWidth - tooltip.offsetWidth - 8))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(y + 12, window.innerHeight - tooltip.offsetHeight - 8))}px`;
}
function scheduleHide() { hideTimer = setTimeout(() => { tooltip.hidden = true; }, 220); }
tooltip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
tooltip.addEventListener('mouseleave', scheduleHide);
tooltip.addEventListener('focusin', () => clearTimeout(hideTimer));
tooltip.addEventListener('focusout', scheduleHide);

function renderScatterPlot(commits) {
  if (!commits.length) {
    d3.select('#chart').text('No committed lines were found in this snapshot.');
    return;
  }
  const width = 1000, height = 560;
  const area = { left: 78, right: 975, top: 30, bottom: 495 };
  const extent = d3.extent(commits, (d) => d.datetime);
  if (+extent[0] === +extent[1]) { extent[0] = d3.timeDay.offset(extent[0], -1); extent[1] = d3.timeDay.offset(extent[1], 1); }
  const x = d3.scaleTime().domain(extent).range([area.left, area.right]).nice();
  const y = d3.scaleLinear().domain([0, 24]).range([area.bottom, area.top]);
  const r = d3.scaleSqrt().domain([0, d3.max(commits, (d) => d.totalLines)]).range([0, 24]);
  const svg = d3.select('#chart').append('svg').attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img').attr('aria-label', 'Scatterplot of commits by date and recorded local time. Circle area indicates current lines attributed to each commit.');
  svg.append('g').attr('class', 'gridlines').attr('transform', `translate(${area.left}, 0)`)
    .call(d3.axisLeft(y).tickValues([0, 6, 12, 18, 24]).tickSize(-(area.right-area.left)).tickFormat(''));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0, ${area.bottom})`).call(d3.axisBottom(x).ticks(6));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${area.left}, 0)`)
    .call(d3.axisLeft(y).tickValues([0, 6, 12, 18, 24]).tickFormat((hour) => `${String(hour % 24).padStart(2, '0')}:00`));
  svg.append('text').attr('class', 'axis-label').attr('x', (area.left+area.right)/2).attr('y', 548).attr('text-anchor', 'middle').text('Commit date');
  svg.append('text').attr('class', 'axis-label').attr('transform', `translate(18, ${(area.top+area.bottom)/2}) rotate(-90)`).attr('text-anchor', 'middle').text('Time of day (recorded local time)');

  const brushLayer = svg.append('g').attr('class', 'brush');
  const dots = svg.append('g').attr('class', 'dots').selectAll('circle')
    .data(d3.sort(commits, (d) => -d.totalLines)).join('circle')
    .attr('cx', (d) => x(d.datetime)).attr('cy', (d) => y(d.hourFrac)).attr('r', (d) => r(d.totalLines))
    .attr('tabindex', 0).attr('aria-label', (d) => `${d.author}, ${d.date} ${d.time}, ${d.totalLines} current lines`)
    .on('mouseenter focus', showTooltip).on('mouseleave blur', scheduleHide);
  function brushed(event) {
    const bounds = event.selection;
    const selected = bounds ? commits.filter((d) => {
      const px=x(d.datetime), py=y(d.hourFrac);
      return bounds[0][0] <= px && px <= bounds[1][0] && bounds[0][1] <= py && py <= bounds[1][1];
    }) : [];
    const selectedIds = new Set(selected.map((d) => d.id));
    dots.classed('selected', (d) => selectedIds.has(d.id));
    count.textContent = selected.length ? `${selected.length} ${selected.length === 1 ? 'commit' : 'commits'} selected` : 'No commits selected';
    clearButton.disabled = !bounds;
    breakdown.replaceChildren();
    if (!selected.length) {
      const dt = document.createElement('dt'); dt.textContent = 'Select commits in the chart to see their language breakdown.'; breakdown.append(dt); return;
    }
    const lines = selected.flatMap((d) => d.lines);
    const languages = d3.rollups(lines, (group) => group.length, (line) => line.type).sort((a,b) => d3.descending(a[1], b[1]));
    for (const [language, total] of languages) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = language; dd.textContent = `${d3.format(',')(total)} lines (${d3.format('.1%')(total/lines.length)})`; breakdown.append(dt, dd);
    }
  }
  const brush = d3.brush().extent([[area.left,area.top],[area.right,area.bottom]]).on('start brush end', brushed);
  brushLayer.call(brush);
  clearButton.addEventListener('click', () => brushLayer.call(brush.move, null));
}

try {
  const lines = await d3.csv('loc.csv', (row) => ({ ...row, line: +row.line, depth: +row.depth, length: +row.length, datetime: new Date(row.datetime) }));
  const commits = processCommits(lines).filter((commit) => !Number.isNaN(+commit.datetime) && Number.isFinite(commit.hourFrac));
  renderStats(lines, commits);
  renderScatterPlot(commits);
} catch (error) {
  document.querySelector('#stats').textContent = '';
  const message = document.querySelector('#data-error');
  message.hidden = false;
  message.textContent = 'Unable to load the code data. Serve the portfolio with a local web server and make sure meta/loc.csv exists.';
  console.error('Unable to load code data:', error);
}

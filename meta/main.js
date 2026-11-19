import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

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
  document.querySelector('#tooltip-commit-time').textContent = `${commit.time} (UTC${commit.timezone})`;
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
  svg.append('g').attr('class', 'axis x-axis').attr('transform', `translate(0, ${area.bottom})`).call(d3.axisBottom(x).ticks(6));
  svg.append('g').attr('class', 'axis y-axis').attr('transform', `translate(${area.left}, 0)`)
    .call(d3.axisLeft(y).tickValues([0, 6, 12, 18, 24]).tickFormat((hour) => `${String(hour % 24).padStart(2, '0')}:00`));
  svg.append('text').attr('class', 'axis-label').attr('x', (area.left+area.right)/2).attr('y', 548).attr('text-anchor', 'middle').text('Commit date');
  svg.append('text').attr('class', 'axis-label').attr('transform', `translate(18, ${(area.top+area.bottom)/2}) rotate(-90)`).attr('text-anchor', 'middle').text('Time of day (recorded local time)');

  const brushLayer = svg.append('g').attr('class', 'brush');
  const dots = svg.append('g').attr('class', 'dots');
  let visibleCommits = commits;
  let selectedIds = new Set();
  let preserveSelection = false;
  function brushed(event) {
    if (preserveSelection) return;
    const bounds = event.selection;
    const selected = bounds ? visibleCommits.filter((d) => {
      const px=x(d.datetime), py=y(d.hourFrac);
      return bounds[0][0] <= px && px <= bounds[1][0] && bounds[0][1] <= py && py <= bounds[1][1];
    }) : [];
    selectedIds = new Set(selected.map((d) => d.id));
    dots.selectAll('circle').classed('selected', (d) => selectedIds.has(d.id));
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

  function updateScatterPlot(filteredCommits, keepSelection = false) {
    preserveSelection = keepSelection;
    brushLayer.call(brush.move, null);
    preserveSelection = false;
    tooltip.hidden = true;
    visibleCommits = filteredCommits;
    const filteredExtent = d3.extent(filteredCommits, (d) => d.datetime);
    if (filteredCommits.length) {
      if (+filteredExtent[0] === +filteredExtent[1]) {
        filteredExtent[0] = d3.timeDay.offset(filteredExtent[0], -1);
        filteredExtent[1] = d3.timeDay.offset(filteredExtent[1], 1);
      }
      x.domain(filteredExtent).nice();
    }
    r.domain([0, d3.max(filteredCommits, (d) => d.totalLines) ?? 0]);
    svg.select('g.x-axis').call(d3.axisBottom(x).ticks(6));
    dots.selectAll('circle')
      .data(d3.sort(filteredCommits, (d) => -d.totalLines), (d) => d.id).join('circle')
      .attr('cx', (d) => x(d.datetime)).attr('cy', (d) => y(d.hourFrac)).attr('r', (d) => r(d.totalLines))
      .classed('selected', (d) => selectedIds.has(d.id))
      .attr('tabindex', 0).attr('aria-label', (d) => `${d.author}, ${d.date} ${d.time}, ${d.totalLines} current lines`)
      .on('mouseenter focus', showTooltip).on('mouseleave blur', scheduleHide);
  }
  updateScatterPlot(commits);
  return updateScatterPlot;
}

const colors = d3.scaleOrdinal(d3.schemeTableau10);

function updateFileDisplay(filteredCommits) {
  const lines = filteredCommits.flatMap((commit) => commit.lines);
  const files = d3.groups(lines, (line) => line.file)
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);
  const filesContainer = d3.select('#files').selectAll(':scope > div')
    .data(files, (d) => d.name)
    .join((enter) => enter.append('div').call((div) => {
      const dt = div.append('dt');
      dt.append('code');
      dt.append('small');
      div.append('dd');
    }));
  filesContainer.select('dt > code').text((d) => d.name);
  filesContainer.select('dt > small').text((d) => `${d.lines.length} lines`);
  filesContainer.select('dd').selectAll('div')
    .data((d) => d.lines).join('div')
    .attr('class', 'loc').style('--color', (d) => colors(d.type));
}

try {
  const lines = await d3.csv('loc.csv', (row) => ({ ...row, line: +row.line, depth: +row.depth, length: +row.length, datetime: new Date(row.datetime) }));
  const commits = processCommits(lines).filter((commit) => !Number.isNaN(+commit.datetime) && Number.isFinite(commit.hourFrac))
    .sort((a, b) => d3.ascending(a.datetime, b.datetime));
  renderStats(lines, commits);
  const updateScatterPlot = renderScatterPlot(commits);
  if (commits.length) {
    let commitProgress = 100;
    const timeScale = d3.scaleTime().domain(d3.extent(commits, (d) => d.datetime)).range([0, 100]);
    let commitMaxTime = timeScale.invert(commitProgress);
    let filteredCommits = commits;
    const slider = document.querySelector('#commit-progress');
    const commitTime = document.querySelector('#commit-time');

    function updateVisualizations() {
      commitTime.dateTime = commitMaxTime.toISOString();
      commitTime.textContent = commitMaxTime.toLocaleString('en', { dateStyle: 'long', timeStyle: 'short' });
      filteredCommits = commits.filter((commit) => commit.datetime <= commitMaxTime);
      renderStats(filteredCommits.flatMap((commit) => commit.lines), filteredCommits);
      updateScatterPlot(filteredCommits);
      updateFileDisplay(filteredCommits);
    }

    function onTimeSliderChange() {
      commitProgress = +slider.value;
      commitMaxTime = timeScale.invert(commitProgress);
      updateVisualizations();
    }
    slider.addEventListener('input', onTimeSliderChange);
    onTimeSliderChange();

    const steps = d3.select('#scatter-story').selectAll('.step').data(commits).join('div').attr('class', 'step');
    steps.classed('is-active', (_, index) => index === 0);
    steps.each(function (commit, index) {
      const step = d3.select(this);
      step.append('span').text(`On ${commit.datetime.toLocaleString('en', { dateStyle: 'full', timeStyle: 'short' })}, `);
      step.append('a').attr('href', commit.url).attr('target', '_blank').attr('rel', 'noopener noreferrer')
        .text(index > 0 ? 'another commit' : 'the first commit');
      const fileCount = d3.groups(commit.lines, (line) => line.file).length;
      step.append('span').text(` was made. ${commit.totalLines} current lines across ${fileCount} ${fileCount === 1 ? 'file' : 'files'} are attributed to it.`);
    });

    const scroller = scrollama();
    scroller.setup({ step: '#scatter-story .step' })
      .onStepEnter(({ element }) => {
        steps.classed('is-active', function () { return this === element; });
        const storyTime = element.__data__.datetime;
        updateScatterPlot(commits.filter((commit) => commit.datetime <= storyTime), true);
      });
    window.addEventListener('resize', () => scroller.resize());
  }
} catch (error) {
  document.querySelector('#stats').textContent = '';
  const message = document.querySelector('#data-error');
  message.hidden = false;
  message.textContent = 'Unable to load the code data. Serve the portfolio with a local web server and make sure meta/loc.csv exists.';
  console.error('Unable to load code data:', error);
}

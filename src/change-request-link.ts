/** Resolve a link without fetching it or sending credentials. */
export function parseChangeRequestLink(value: string) {
  const invalid = () => Object.assign(new Error('Enter a GitHub PR or GitLab MR URL using HTTPS.'), { statusCode: 400 });
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password) throw invalid();
  const github = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/([1-9]\d*)\/?$/);
  const gitlab = url.pathname.match(/^\/(.+)\/-\/merge_requests\/([1-9]\d*)\/?$/);
  const provider = github && url.hostname !== 'gitlab.com' ? 'github' : gitlab && url.hostname !== 'github.com' ? 'gitlab' : null;
  if (!provider) throw invalid();
  let projectKey = provider === 'github' ? `${github![1]}/${github![2]}`.toLowerCase() : gitlab![1]!;
  try { projectKey = projectKey.split('/').map(part => { const decoded=decodeURIComponent(part); if(!/^[a-zA-Z0-9_.-]+$/.test(decoded))throw invalid(); return decoded; }).join('/');
    if(provider==='github')projectKey=projectKey.toLowerCase(); } catch { throw invalid(); }
  if (projectKey.split('/').length < 2 || !projectKey.split('/').every(part => /^[a-zA-Z0-9_.-]+$/.test(part) && part !== '.' && part !== '..')) throw invalid();
  const issueKey = provider === 'github' ? github![3]! : gitlab![2]!;
  if (!Number.isSafeInteger(Number(issueKey))) throw invalid();
  const instanceUrl = url.origin;
  const resourceType = provider === 'github' ? 'pull_request' : 'merge_request';
  const canonical = `${instanceUrl}/${projectKey}/${provider === 'github' ? 'pull' : '-/merge_requests'}/${issueKey}`;
  return { provider, instanceUrl, resourceType, projectKey, issueKey, displayRef: `${projectKey}${provider === 'github' ? '#' : '!'}${issueKey}`, url: canonical };
}

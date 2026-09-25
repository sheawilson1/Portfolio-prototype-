// The site's details and the work, with no three.js, so any page can use them
const ROOT = new URL('../../', import.meta.url);
export const asset = (p) => new URL(p, ROOT).href;

export const SITE = {
  name: 'Shea Wilson',
  role: 'Design engineer',
  email: 'design@sheawilson.uk',
  url: 'https://sheawilson.uk',
  linkedin: 'https://www.linkedin.com/in/sheawilson0/',
};

export const CARD = { w: 85, h: 55 };

// The corona from site.css, in order round the ring (degrees from twelve o'clock)
export const CORONA = [
  [0, '#ed1652'], [36, '#ff6a1a'], [64, '#ffb22c'], [96, '#fde9cf'], [140, '#e3ebff'], [182, '#43d9ff'],
  [220, '#e3ebff'], [256, '#8a3cff'], [292, '#fde9cf'], [326, '#3a17e0'], [360, '#ed1652'],
];
export const SPECTRUM = ['#ed1652', '#ff6a1a', '#ffb22c', '#43d9ff', '#8a3cff', '#3a17e0'];

// Copy is the homepage's own, word for word
export const PROJECTS = [
  {
    id: 'snapshot', name: 'Smoking Snapshot', label: 'Smoking Ends Here · Champs and NHS', status: '975 uses',
    tone: '#ed1652', colors: ['#3a17e0', '#ed1652', '#ff6a1a'], href: asset('snapshot.html'),
    line: 'A one-minute calculator that shows people what “only socially” adds up to over a year. People found it through paid social and used it on their phones or on iPads at events.',
  },
  {
    id: 'jumpstart', name: 'JumpStart', label: 'Agency reporting product', status: 'In pilot',
    tone: '#4fae86', colors: ['#4fae86', '#8fd4b4', '#0b5c45'], href: asset('jumpstart.html'),
    line: 'Paid media reporting that explains itself. Clients get a plain-English read of what changed, why it matters and what happens next. The agency runs every account from one desk.',
  },
  {
    id: 'heart', name: 'Heart Health', label: 'Smoking Ends Here · Champs and NHS', status: 'Live now',
    tone: '#43d9ff', colors: ['#43d9ff', '#ed1652', '#08717d'], href: 'https://hearthealth.smokingendshere.com/', external: true,
    line: 'Tap the cigarette and watch the heart monitor react. It’s running now as paid social on Instagram, Facebook and other platforms.',
  },
  {
    id: 'brain', name: 'Brain Dump', label: 'Personal project', status: 'In beta',
    tone: '#8a3cff', colors: ['#8a3cff', '#5b2bff', '#c77dff'], href: asset('braindump.html'),
    line: 'Type or talk, and it sorts the lot into tasks, routines, ideas and projects.',
  },
];

// A little more on each, for the project panel. Every word comes from the homepage or the case study.
const DETAILS = {
  snapshot: {
    media: ['assets/media/snapshot/phone-open.webp', 'assets/media/snapshot/phone-results.webp', 'assets/media/snapshot/field-ipad.webp'],
    stats: [['975', 'snapshots completed'], ['41,904', 'clicks from paid social'], ['50%', 'said they’d rethink how much they smoke']],
    story: ['What I did', 'The prototype, the user journey and the question flow, the build, the live dashboard and the final report. Aleks designed the look and Kelly wrote the copy.'],
    facts: [['Client', 'Smoking Ends Here, for Champs and NHS Cheshire and Merseyside'], ['Role', 'Prototype, UX, build and reporting'], ['Timeline', 'May to September 2026'], ['Built with', 'HTML, CSS and JavaScript, Supabase, Vercel, Claude Code and Codex']],
    live: 'https://snapshot.smokingendshere.com/',
  },
  jumpstart: {
    media: ['assets/media/jumpstart/brief-light.webp', 'assets/media/jumpstart/desk.webp', 'assets/media/jumpstart/export.webp'],
    stats: [['100', 'prototypes and design labs'], ['9', 'weeks from the handover to a live client page'], ['4', 'ways to send a report']],
    story: ['What I did', 'Everything from the audit on: research, product thinking, interface, tone of voice and the build.'],
    facts: [['Status', 'In pilot with the National Football Museum'], ['Role', 'Product design and build'], ['Team', 'With James on product and Alex on paid media, at Influential'], ['Timeline', 'June 2026 to now'], ['Built with', 'Claude Code, Codex, Next.js, WorkOS, Vercel, PostHog and the Meta Marketing API']],
  },
  heart: {
    video: [['assets/media/heart/heart-screen.webm', 'video/webm'], ['assets/media/heart/heart-screen.mp4', 'video/mp4']],
  },
  brain: {
    media: ['assets/media/home/brain-home.webp', 'assets/media/home/brain-voice.webp', 'assets/media/home/brain-ai-input.webp'],
    story: ['Why I built it', 'I kept losing track of things across too many apps.'],
    facts: [['Type', 'Personal project'], ['Status', 'In beta'], ['Built with', 'Next.js, TypeScript, Tailwind CSS, Supabase, Claude API, Google Auth and Vercel']],
    live: 'https://demo.mybraindump.dev/',
  },
};
for (const p of PROJECTS) p.details = DETAILS[p.id];

export const MORE = [
  { id: 'cipher', name: 'Cipher', label: 'Brand, web and app', status: 'Concept', tone: '#0ec980', href: asset('cipher.html'), img: 'assets/media/home/cipher.webp', line: 'Brand guidelines, website and app for an AI-first bank.' },
  { id: 'amp', name: 'Amp', label: 'Mobile app', status: 'Concept', tone: '#ff6a2b', href: asset('amp.html'), img: 'assets/media/home/amp.webp', line: 'A music player built around smart playback and moving between devices.' },
  { id: 'captr', name: 'Captr', label: 'Apple Watch app', status: 'Concept', tone: '#0f88f0', href: asset('captr.html'), img: 'assets/media/home/captr.webp', line: 'Capture a task, give it a priority and tick it off from your wrist.' },
];

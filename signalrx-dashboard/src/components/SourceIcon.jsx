/**
 * SourceIcon.jsx — Dynamic source icon renderer
 * Maps project.source / project.source_type to the correct icon.
 *
 * Usage:
 *   <SourceIcon source="Twitter" size={16} />
 *   <SourceIcon source="Wikipedia" size={20} showLabel />
 *   <SourceIcon sourceType="custom_url" size={14} />
 */
import {
  MdLanguage, MdArticle, MdNewspaper, MdSearch,
  MdRssFeed, MdBusiness,
} from 'react-icons/md'
import { SiX, SiWikipedia, SiReddit } from 'react-icons/si'

const SOURCE_MAP = {
  // Social
  twitter:    { Icon: SiX,           color: '#1DA1F2', label: 'X (Twitter)' },
  x:          { Icon: SiX,           color: '#1DA1F2', label: 'X (Twitter)' },
  // Encyclopaedia
  wikipedia:  { Icon: SiWikipedia,   color: '#636363', label: 'Wikipedia'   },
  // Social communities
  reddit:     { Icon: SiReddit,      color: '#FF4500', label: 'Reddit'      },
  // Webpage / custom
  website:    { Icon: MdLanguage,    color: '#6B7280', label: 'Website'     },
  custom_url: { Icon: MdLanguage,    color: '#6B7280', label: 'Website'     },
  url:        { Icon: MdLanguage,    color: '#6B7280', label: 'Website'     },
  // Content types
  blog:       { Icon: MdArticle,     color: '#10B981', label: 'Blog'        },
  news:       { Icon: MdNewspaper,   color: '#3B82F6', label: 'News'        },
  rss:        { Icon: MdRssFeed,     color: '#F59E0B', label: 'RSS Feed'    },
  // Fallback
  unknown:    { Icon: MdSearch,      color: '#9CA3AF', label: 'Unknown'     },
}

function normalise(str) {
  return (str || '').toLowerCase().trim()
}

function resolve(source, sourceType) {
  const src  = normalise(source)
  const type = normalise(sourceType)

  // Exact source name match
  if (SOURCE_MAP[src])  return SOURCE_MAP[src]
  // source_type match
  if (SOURCE_MAP[type]) return SOURCE_MAP[type]
  // Partial match  (e.g. source = "X (Twitter)")
  for (const key of Object.keys(SOURCE_MAP)) {
    if (src.includes(key) || key.includes(src)) return SOURCE_MAP[key]
  }
  return SOURCE_MAP.unknown
}

/**
 * @param {string}  source      — e.g. "Twitter", "Wikipedia", "website", "Blog"
 * @param {string}  sourceType  — e.g. "social", "encyclopedia", "custom_url"
 * @param {number}  size        — icon pixel size (default 16)
 * @param {boolean} showLabel   — show text label next to icon
 * @param {string}  className   — extra CSS class
 * @param {object}  style       — extra inline styles on the wrapper
 */
export default function SourceIcon({ source, sourceType, size = 16, showLabel = false, className = '', style = {} }) {
  const { Icon, color, label } = resolve(source, sourceType)

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...style }}
      title={label}
    >
      <Icon size={size} style={{ color, flexShrink: 0 }} />
      {showLabel && (
        <span style={{ fontSize: size * 0.85, color, fontWeight: 600 }}>{label}</span>
      )}
    </span>
  )
}

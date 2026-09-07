export default function ProsCons({ pros, cons }) {
  return (
    <div id="pros-cons" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="bg-steam-card rounded-2xl border border-steam-border p-5 sm:p-6 shadow-xl">
        <h3 className="text-sm font-semibold text-steam-positive uppercase tracking-wider mb-4 flex items-center gap-2">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Pros
        </h3>
        <ul className="space-y-3">
          {(pros || []).map((pro, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-steam-positive/10 flex items-center justify-center">
                <svg
                  className="w-3 h-3 text-steam-positive"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              </span>
              <span className="text-sm text-gray-300 leading-snug">{pro}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-steam-card rounded-2xl border border-steam-border p-5 sm:p-6 shadow-xl">
        <h3 className="text-sm font-semibold text-steam-negative uppercase tracking-wider mb-4 flex items-center gap-2">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Cons
        </h3>
        <ul className="space-y-3">
          {(cons || []).map((con, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-steam-negative/10 flex items-center justify-center">
                <svg
                  className="w-3 h-3 text-steam-negative"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </span>
              <span className="text-sm text-gray-300 leading-snug">{con}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


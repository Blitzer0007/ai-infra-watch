      {Object.keys(answers).length > 0 && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {(Object.entries(answers) as Array<[string, JevAnswer]>).map(([key, answer]) => (
            <div key={key} className="rounded-xl border border-white/5 bg-black/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-mono uppercase tracking-wider text-white/35">{labelize(key)}</span>
                <ShieldCheck className="w-3.5 h-3.5 text-fuchsia-300/70" />
              </div>

              {answer.type === 'choice' && (
                <>
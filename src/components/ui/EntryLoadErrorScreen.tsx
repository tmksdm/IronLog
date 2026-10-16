// src/components/ui/EntryLoadErrorScreen.tsx

/**
 * Shown when the application module could not be loaded at all — for example
 * when the request for its chunk failed. It belongs to the entry bundle on
 * purpose: it must render without the application being available.
 *
 * Recovery is a reload, so it never depends on the code that failed to load.
 */
export function EntryLoadErrorScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#121212] px-6 text-center">
      <h1 className="text-xl font-bold text-white">Не удалось загрузить приложение</h1>
      <p className="mt-3 max-w-sm text-sm text-[#B0B0B0]">
        Локальные данные не изменялись. Проверьте соединение и попробуйте ещё раз.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 rounded-xl bg-[#4CAF50] px-6 py-3 font-semibold text-white active:bg-[#388E3C]"
      >
        Повторить
      </button>
    </div>
  );
}

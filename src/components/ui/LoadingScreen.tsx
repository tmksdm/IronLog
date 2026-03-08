// src/components/ui/LoadingScreen.tsx

export function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-[#121212]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-[#B0B0B0] text-sm">Загрузка...</span>
      </div>
    </div>
  );
}

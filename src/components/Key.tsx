interface KeyProps {
  letter: string;
}

function Key({ letter }: KeyProps) {
  return (
    <div
      id={letter}
      className="h-15 w-15 bg-slate-50 rounded-sm flex justify-center items-center shadow-md transition-transform"
    >
      <p className="font-black">{letter.toUpperCase()}</p>
    </div>
  );
}

export default Key;

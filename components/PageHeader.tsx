interface Props {
  title: string;
  description?: string;
}

export default function PageHeader({ title, description }: Props) {
  return (
    <div className="mb-6 md:mb-8">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-zinc-50 via-zinc-100 to-zinc-300 bg-clip-text text-transparent">
        {title}
      </h1>
      {description && (
        <p className="text-xs md:text-sm text-zinc-400 mt-1.5">{description}</p>
      )}
    </div>
  );
}

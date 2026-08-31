export default function SongInfo({ title, artist }) {
    return (
        <div className="text-center w-full mb-6">
            <h2 className="text-lg font-bold text-text-primary-light dark:text-text-primary-dark truncate px-2 leading-tight">
                {title}
            </h2>
            <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark mt-1 font-medium truncate px-4">
                {artist}
            </p>
        </div>
    );
}

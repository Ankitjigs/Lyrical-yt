export default function AlbumArt({ src }) {
    return (
        <div className="w-40 h-40 rounded-xl shadow-lg mb-6 overflow-hidden relative group">
            <img
                src={src}
                alt="Album Art"
                className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-black/10 dark:bg-black/20"></div>
        </div>
    );
}

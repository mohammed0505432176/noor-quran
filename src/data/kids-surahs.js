// Surahs for kids with a "teacher" reciter (pauses for repetition). Audio hotlinked from everyayah.com.

export const KIDS_SURAHS = [1, 114, 113, 112, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 100, 99, 98, 97, 96, 95, 94, 93];

export const TEACHER = ['Husary_Muallim_128kbps', 'Minshawy_Teacher_128kbps'];

const pad3 = n => String(n).padStart(3, '0');
export const teacherUrl = (folder, s, a) => `https://everyayah.com/data/${folder}/${pad3(s)}${pad3(a)}.mp3`;

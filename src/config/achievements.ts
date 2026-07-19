export interface TitleAchievement {
  id: string;
  title: string;
  description: string;
  conditionDescription: string;
  checkFn: (stats: UserStats) => boolean;
}

export interface UserStats {
  completedAsAcceptor: number;
  completedAsRequester: number;
  averageRating: number;
  ratingCount: number;
  broadcastCount: number;
}

export const TITLE_ACHIEVEMENTS: TitleAchievement[] = [
  {
    id: 'rookie_hero',
    title: '初出茅廬的超人',
    description: '踏出互助的第一步！',
    conditionDescription: '成功承接並完成 1 次委託任務',
    checkFn: (stats) => stats.completedAsAcceptor >= 1,
  },
  {
    id: 'helper_pro',
    title: '熱心鄰里楷模',
    description: '經常幫助鄰里解決難題。',
    conditionDescription: '成功承接並完成 5 次委託任務',
    checkFn: (stats) => stats.completedAsAcceptor >= 5,
  },
  {
    id: 'legend_hero',
    title: '救難大師 995',
    description: '社區公認的萬能救星！',
    conditionDescription: '成功承接並完成 15 次委託任務',
    checkFn: (stats) => stats.completedAsAcceptor >= 15,
  },
  {
    id: 'generous_boss',
    title: '慷慨的委託人',
    description: '樂於為社區帶來工作機會。',
    conditionDescription: '發布並順利完成 3 次委託任務',
    checkFn: (stats) => stats.completedAsRequester >= 3,
  },
  {
    id: 'five_star_superman',
    title: '五星神級好評',
    description: '服務品質極高，零負評。',
    conditionDescription: '獲得 5 星好評且評價次數達 3 次以上',
    checkFn: (stats) => stats.averageRating >= 4.9 && stats.ratingCount >= 3,
  },
  {
    id: 'loudspeaker',
    title: '黃金大喇叭',
    description: '善用廣播宣傳，活絡社區氣氛。',
    conditionDescription: '發送緊急廣播達 3 次以上',
    checkFn: (stats) => stats.broadcastCount >= 3,
  },
  {
    id: 'silent_guardian',
    title: '默默守護的黑夜騎士',
    description: '總是低調完成各項艱難託付。',
    conditionDescription: '成功承接並完成 10 次委託任務，且平均評分達 4.5 以上',
    checkFn: (stats) => stats.completedAsAcceptor >= 10 && stats.averageRating >= 4.5,
  }
];

export const TASK_CATEGORIES = [
  '跑腿代購',
  '家事清潔',
  '寵物照顧',
  '課業輔導',
  '水電維修',
  '文書處理',
  '搬家協助',
  '其他'
];

export const TAIWAN_REGIONS = [
  '台北市',
  '新北市',
  '基隆市',
  '宜蘭縣',
  '桃園市',
  '新竹市',
  '新竹縣',
  '苗栗縣',
  '台中市',
  '彰化縣',
  '南投縣',
  '雲林縣',
  '嘉義市',
  '嘉義縣',
  '台南市',
  '高雄市',
  '屏東縣',
  '花蓮縣',
  '台東縣',
  '澎湖縣',
  '金門縣',
  '連江縣'
];

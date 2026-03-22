/** Trục MBTI: E-I, S-N, T-F, J-P */
export type Dimension = "E_I" | "S_N" | "T_F" | "J_P";

export interface MBTIQuestion {
  id: string;
  dimension: Dimension;
  /**
   * chiều được cộng khi người dùng chấm điểm cao hơn trung tính (4) trên thang 1‑7
   */
  agree: "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P";
  /**
   * chiều còn lại, cộng khi người dùng chấm điểm 1‑3
   */
  disagree: "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P";
  /** tuyên ngôn để người dùng đánh giá với thang Likert 7 mức */
  text: string;
}

/** 20 tuyên ngôn định hướng 4 chiều MBTI */
export const MBTI_QUESTIONS: MBTIQuestion[] = [
  // E - I
  {
    id: "ei1",
    dimension: "E_I",
    agree: "I",
    disagree: "E",
    text: "Bạn thường không thích trở thành tâm điểm chú ý.",
  },
  {
    id: "ei2",
    dimension: "E_I",
    agree: "E",
    disagree: "I",
    text: "Bạn thích tham gia các hoạt động nhóm.",
  },
  {
    id: "ei3",
    dimension: "E_I",
    agree: "E",
    disagree: "I",
    text: "Trong nhóm bạn, bạn thường là người chủ động liên lạc và rủ mọi người cùng làm việc gì đó.",
  },
  {
    id: "ei4",
    dimension: "E_I",
    agree: "E",
    disagree: "I",
    text: "Sau một tuần dài mệt mỏi, bạn muốn đi gặp gỡ và tụ tập với mọi người.",
  },
  {
    id: "ei5",
    dimension: "E_I",
    agree: "I",
    disagree: "E",
    text: "Bạn thường ngại hoặc tránh gọi điện thoại.",
  },
  // S - N
  {
    id: "sn1",
    dimension: "S_N",
    agree: "N",
    disagree: "S",
    text: "Bạn thích những cuốn sách hoặc bộ phim có kết thúc mở để người xem tự suy nghĩ và diễn giải.",
  },
  {
    id: "sn2",
    dimension: "S_N",
    agree: "N",
    disagree: "S",
    text: "Bạn thấy mình hứng thú với quá nhiều thứ nên đôi khi khó chọn nên thử điều gì tiếp theo.",
  },
  {
    id: "sn3",
    dimension: "S_N",
    agree: "N",
    disagree: "S",
    text: "Bạn thường dành nhiều thời gian để tìm hiểu những quan điểm rất khác với mình.",
  },
  {
    id: "sn4",
    dimension: "S_N",
    agree: "S",
    disagree: "N",
    text: "Bạn không hứng thú lắm với việc bàn luận các cách hiểu khác nhau về sách, phim hay tác phẩm nghệ thuật.",
  },
  {
    id: "sn5",
    dimension: "S_N",
    agree: "S",
    disagree: "N",
    text: "Bạn không phải kiểu người có thiên hướng nghệ thuật.",
  },
  // T - F
  {
    id: "tf1",
    dimension: "T_F",
    agree: "T",
    disagree: "F",
    text: "Bạn thường quyết định dựa vào lý trí hơn là cảm xúc.",
  },
  {
    id: "tf2",
    dimension: "T_F",
    agree: "F",
    disagree: "T",
    text: "Bạn cảm thấy vui khi giúp người khác đạt được mục tiêu, đôi khi còn hơn cả khi mình tự đạt được.",
  },
  {
    id: "tf3",
    dimension: "T_F",
    agree: "T",
    disagree: "F",
    text: "Bạn thường khó hiểu được cảm xúc của người khác.",
  },
  {
    id: "tf4",
    dimension: "T_F",
    agree: "F",
    disagree: "T",
    text: "Khi thấy người khác khóc, bạn cũng dễ xúc động theo.",
  },
  {
    id: "tf5",
    dimension: "T_F",
    agree: "F",
    disagree: "T",
    text: "Bạn dễ đồng cảm với người có trải nghiệm sống rất khác mình.",
  },
  // J - P
  {
    id: "jp1",
    dimension: "J_P",
    agree: "P",
    disagree: "J",
    text: "Bạn thích làm theo cảm hứng hơn là lên kế hoạch cụ thể cho một ngày.",
  },
  {
    id: "jp2",
    dimension: "J_P",
    agree: "P",
    disagree: "J",
    text: "Bạn thường gặp khó khăn khi phải làm việc theo deadline.",
  },
  {
    id: "jp3",
    dimension: "J_P",
    agree: "P",
    disagree: "J",
    text: "Bạn hay để mọi việc đến sát giờ mới làm.",
  },
  {
    id: "jp4",
    dimension: "J_P",
    agree: "J",
    disagree: "P",
    text: "Bạn thích có danh sách việc cần làm mỗi ngày.",
  },
  {
    id: "jp5",
    dimension: "J_P",
    agree: "J",
    disagree: "P",
    text: "Bạn thích dùng lịch hoặc danh sách để sắp xếp công việc.",
  },
];

export type MBTIType =
  | "INTJ" | "INTP" | "ENTJ" | "ENTP"
  | "INFJ" | "INFP" | "ENFJ" | "ENFP"
  | "ISTJ" | "ISFJ" | "ESTJ" | "ESFJ"
  | "ISTP" | "ISFP" | "ESTP" | "ESFP";

export interface MBTITypeInfo {
  type: MBTIType;
  nameVi: string;
  traits: string[];
}

/** 16 nhóm MBTI – mô tả và định hướng nghề cho sinh viên kinh tế */
export const MBTI_TYPE_INFO: Record<MBTIType, MBTITypeInfo> = {
  INTJ: {
    type: "INTJ",
    nameVi: "Nhà chiến lược",
    traits: ["Logic", "Độc lập", "Có tầm nhìn", "Quyết đoán", "Hướng mục tiêu"],
  },
  INTP: {
    type: "INTP",
    nameVi: "Nhà tư duy",
    traits: ["Phân tích", "Sáng tạo", "Độc lập", "Tò mò", "Khách quan"],
  },
  ENTJ: {
    type: "ENTJ",
    nameVi: "Nhà điều hành",
    traits: ["Lãnh đạo", "Quyết đoán", "Chiến lược", "Năng động", "Cạnh tranh"],
  },
  ENTP: {
    type: "ENTP",
    nameVi: "Nhà sáng tạo",
    traits: ["Sáng tạo", "Linh hoạt", "Thích thử thách", "Giao tiếp tốt", "Tranh luận"],
  },
  INFJ: {
    type: "INFJ",
    nameVi: "Người hướng dẫn",
    traits: ["Đồng cảm", "Có tầm nhìn", "Nguyên tắc", "Hỗ trợ", "Kiên định"],
  },
  INFP: {
    type: "INFP",
    nameVi: "Người lý tưởng",
    traits: ["Sáng tạo", "Đồng cảm", "Lý tưởng", "Linh hoạt", "Trung thành"],
  },
  ENFJ: {
    type: "ENFJ",
    nameVi: "Người dẫn dắt",
    traits: ["Lãnh đạo", "Đồng cảm", "Truyền cảm hứng", "Tổ chức", "Trách nhiệm"],
  },
  ENFP: {
    type: "ENFP",
    nameVi: "Người truyền cảm hứng",
    traits: ["Nhiệt huyết", "Sáng tạo", "Giao tiếp", "Linh hoạt", "Truyền cảm hứng"],
  },
  ISTJ: {
    type: "ISTJ",
    nameVi: "Người đáng tin cậy",
    traits: ["Đáng tin", "Chi tiết", "Trách nhiệm", "Ổn định", "Quy trình"],
  },
  ISFJ: {
    type: "ISFJ",
    nameVi: "Người hỗ trợ",
    traits: ["Chu đáo", "Trung thành", "Hỗ trợ", "Chi tiết", "Ổn định"],
  },
  ESTJ: {
    type: "ESTJ",
    nameVi: "Người tổ chức",
    traits: ["Tổ chức", "Quyết đoán", "Thực tế", "Trách nhiệm", "Rõ ràng"],
  },
  ESFJ: {
    type: "ESFJ",
    nameVi: "Người kết nối",
    traits: ["Hòa đồng", "Chăm sóc", "Trách nhiệm", "Hợp tác", "Thực tế"],
  },
  ISTP: {
    type: "ISTP",
    nameVi: "Người thực thi",
    traits: ["Thực tế", "Phân tích", "Linh hoạt", "Bình tĩnh", "Kỹ thuật"],
  },
  ISFP: {
    type: "ISFP",
    nameVi: "Người sáng tạo thực tế",
    traits: ["Sáng tạo", "Linh hoạt", "Đồng cảm", "Thực tế", "Trung thành"],
  },
  ESTP: {
    type: "ESTP",
    nameVi: "Người hành động",
    traits: ["Hành động", "Linh hoạt", "Thực tế", "Tự tin", "Năng động"],
  },
  ESFP: {
    type: "ESFP",
    nameVi: "Người nhiệt huyết",
    traits: ["Nhiệt tình", "Hòa đồng", "Linh hoạt", "Thực tế", "Quan tâm"],
  },
};

extension (s: String)
  def isPalindrome: Boolean =
    val cs = s.filter(_.isLetterOrDigit).toLowerCase
    cs == cs.reverse

def countPalindromes(phrases: List[String]): Int =
  phrases.count(_.isPalindrome)

@main def tests(): Unit =
  Judge.check("빈 문자열")("".isPalindrome, true)
  Judge.check("단순 회문")("level".isPalindrome, true)
  Judge.check("단순 비회문")("abc".isPalindrome, false)
  Judge.check("대소문자 무시")("Madam".isPalindrome, true)
  Judge.check("문장부호와 공백 무시")("A man, a plan, a canal: Panama".isPalindrome, true)
  Judge.check("숫자도 글자로 취급")("12 21".isPalindrome, true)
  Judge.check("개수 세기")(countPalindromes(List("noon", "abc", "Was it a car or a cat I saw?", "hello", "")), 3)
  Judge.check("빈 리스트")(countPalindromes(Nil), 0)

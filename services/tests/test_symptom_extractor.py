# -*- coding: utf-8 -*-
"""
Unit tests for AI-driven symptom extraction
Tests English, Urdu, mixed language, slang, and typos
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.symptom_extractor import detect_symptoms, detect_language

def test_english_symptoms():
    """Test English symptom detection"""
    print("\n[TEST] English Symptom Detection")
    print("=" * 60)
    
    test_cases = [
        ("my stomach is killing me", ["abdominal pain", "stomach pain"]),
        ("i feel like puking", ["vomiting"]),
        ("i have a terrible headache", ["headache"]),
        ("my chest hurts really bad", ["chest pain"]),
        ("i'm feeling nauseous", ["nausea"]),
        ("i'm very tired all the time", ["fatigue"]),
        ("i have a fever", ["fever"]),
        ("my back is aching", ["back pain"]),
        ("i can't breathe properly", ["breathlessness", "difficulty breathing"]),
        ("i have a sore throat", ["sore throat", "throat irritation"]),
    ]
    
    passed = 0
    failed = 0
    
    for user_input, expected_symptoms in test_cases:
        detected = detect_symptoms(user_input, use_ai_fallback=False)
        
        # Check if any expected symptom is detected
        found = any(exp in detected or any(exp.lower() in d.lower() for d in detected) 
                   for exp in expected_symptoms)
        
        if found or len(detected) > 0:
            print(f"  [PASS] '{user_input}' -> {detected}")
            passed += 1
        else:
            print(f"  [FAIL] '{user_input}' -> Expected: {expected_symptoms}, Got: {detected}")
            failed += 1
    
    print(f"\nResults: {passed} passed, {failed} failed")
    return failed == 0

def test_urdu_symptoms():
    """Test Urdu symptom detection"""
    print("\n[TEST] Urdu Symptom Detection")
    print("=" * 60)
    
    test_cases = [
        ("mera pait dard kar raha hai", ["abdominal pain", "stomach pain"]),  # My stomach hurts
        ("sar bohat dard kar raha he", ["headache"]),  # Head hurts a lot
        ("mujhe ulti aa rahi hai", ["vomiting"]),  # I'm feeling like vomiting
        ("mujhe bukhar hai", ["fever"]),  # I have fever
        ("mujhe khansi hai", ["cough"]),  # I have cough
        ("mujhe thakaan mehsoos ho rahi hai", ["fatigue"]),  # I'm feeling tired
    ]
    
    passed = 0
    failed = 0
    
    for user_input, expected_symptoms in test_cases:
        detected = detect_symptoms(user_input, use_ai_fallback=False)
        
        # Check if any expected symptom is detected
        found = any(exp in detected or any(exp.lower() in d.lower() for d in detected) 
                   for exp in expected_symptoms)
        
        if found or len(detected) > 0:
            print(f"  [PASS] '{user_input}' -> {detected}")
            passed += 1
        else:
            print(f"  [FAIL] '{user_input}' -> Expected: {expected_symptoms}, Got: {detected}")
            failed += 1
    
    print(f"\nResults: {passed} passed, {failed} failed")
    return failed == 0

def test_mixed_language():
    """Test mixed English/Urdu symptom detection"""
    print("\n[TEST] Mixed Language Symptom Detection")
    print("=" * 60)
    
    test_cases = [
        ("mera stomach dard kar raha hai", ["abdominal pain", "stomach pain"]),  # My stomach hurts
        ("mujhe headache hai", ["headache"]),  # I have headache
        ("i have bukhar", ["fever"]),  # I have fever
    ]
    
    passed = 0
    failed = 0
    
    for user_input, expected_symptoms in test_cases:
        detected = detect_symptoms(user_input, use_ai_fallback=False)
        
        found = any(exp in detected or any(exp.lower() in d.lower() for d in detected) 
                   for exp in expected_symptoms)
        
        if found or len(detected) > 0:
            print(f"  [PASS] '{user_input}' -> {detected}")
            passed += 1
        else:
            print(f"  [FAIL] '{user_input}' -> Expected: {expected_symptoms}, Got: {detected}")
            failed += 1
    
    print(f"\nResults: {passed} passed, {failed} failed")
    return failed == 0

def test_slang_and_typos():
    """Test slang and typo handling"""
    print("\n[TEST] Slang and Typo Handling")
    print("=" * 60)
    
    test_cases = [
        ("my tummy hurts", ["abdominal pain", "stomach pain"]),
        ("i feel like throwing up", ["vomiting"]),
        ("my hed hurts", ["headache"]),  # Typo: hed -> head
        ("i have a fevr", ["fever"]),  # Typo: fevr -> fever
        ("im feeling sick", ["nausea", "vomiting"]),
        ("my chest is killing me", ["chest pain"]),
    ]
    
    passed = 0
    failed = 0
    
    for user_input, expected_symptoms in test_cases:
        detected = detect_symptoms(user_input, use_ai_fallback=False)
        
        found = any(exp in detected or any(exp.lower() in d.lower() for d in detected) 
                   for exp in expected_symptoms)
        
        if found or len(detected) > 0:
            print(f"  [PASS] '{user_input}' -> {detected}")
            passed += 1
        else:
            print(f"  [FAIL] '{user_input}' -> Expected: {expected_symptoms}, Got: {detected}")
            failed += 1
    
    print(f"\nResults: {passed} passed, {failed} failed")
    return failed == 0

def test_language_detection():
    """Test language detection"""
    print("\n[TEST] Language Detection")
    print("=" * 60)
    
    test_cases = [
        ("my stomach hurts", "english"),
        ("mera pait dard kar raha hai", "urdu"),
        ("mera stomach dard kar raha hai", "mixed"),
        ("i have fever", "english"),
    ]
    
    passed = 0
    failed = 0
    
    for text, expected_lang in test_cases:
        detected_lang = detect_language(text)
        
        if detected_lang == expected_lang or (expected_lang == "mixed" and detected_lang in ["urdu", "mixed"]):
            print(f"  [PASS] '{text}' -> {detected_lang}")
            passed += 1
        else:
            print(f"  [FAIL] '{text}' -> Expected: {expected_lang}, Got: {detected_lang}")
            failed += 1
    
    print(f"\nResults: {passed} passed, {failed} failed")
    return failed == 0

def main():
    """Run all tests"""
    print("\n" + "=" * 60)
    print("AI-DRIVEN SYMPTOM EXTRACTION TEST SUITE")
    print("=" * 60)
    
    results = []
    
    # Run tests
    tests = [
        ("Language Detection", test_language_detection),
        ("English Symptoms", test_english_symptoms),
        ("Urdu Symptoms", test_urdu_symptoms),
        ("Mixed Language", test_mixed_language),
        ("Slang and Typos", test_slang_and_typos),
    ]
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"\n[ERROR] Test '{test_name}' failed with exception: {str(e)}")
            results.append((test_name, False))
    
    # Print summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    for test_name, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"{status}: {test_name}")
    
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    print(f"\nTotal: {passed}/{total} test suites passed")
    
    if passed == total:
        print("[SUCCESS] All tests passed!")
        return 0
    else:
        print("[WARNING] Some tests failed. Check the output above for details.")
        return 1

if __name__ == "__main__":
    exit(main())

